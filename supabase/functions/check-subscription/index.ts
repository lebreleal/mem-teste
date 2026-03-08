import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PREMIUM_PRODUCT_IDS = [
  "prod_U0Ry3cHVkiHuBq", // monthly
  "prod_U0RyXil8BOtEyS", // annual
];

const LIFETIME_PRODUCT_ID = "prod_U0RzkaivSVAWj8";
const LIFETIME_BONUS_CREDITS = 50000;
const MONTHLY_PREMIUM_GRANT = 500;
const MONTHLY_GRANT_DESCRIPTION = "Bônus Premium Mensal: 500 créditos IA";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user?.email) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = userData.user;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check for lifetime purchase first
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("premium_expires_at")
      .eq("id", user.id)
      .single();

    const currentExpiry = profile?.premium_expires_at;
    const isCurrentlyLifetime = currentExpiry && new Date(currentExpiry).getFullYear() > 2090;

    if (isCurrentlyLifetime) {
      return new Response(JSON.stringify({
        subscribed: true,
        plan: "lifetime",
        subscription_end: currentExpiry,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      // No Stripe customer — check for 14-day trial from profile
      if (currentExpiry && new Date(currentExpiry) > new Date()) {
        const createdAt = profile ? (await supabaseAdmin.from("profiles").select("created_at").eq("id", user.id).single()).data?.created_at : null;
        const isTrial = createdAt ? (new Date(currentExpiry).getTime() - new Date(createdAt).getTime()) < 15 * 24 * 60 * 60 * 1000 : false;
        return new Response(JSON.stringify({
          subscribed: true,
          plan: "trial",
          subscription_end: currentExpiry,
          is_trial: isTrial,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;

    // Check active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    const activeSub = subscriptions.data.find((sub) =>
      sub.items.data.some((item) => {
        const prodId = typeof item.price.product === "string" ? item.price.product : "";
        return PREMIUM_PRODUCT_IDS.includes(prodId);
      })
    );

    if (activeSub) {
      const endDate = new Date(activeSub.current_period_end * 1000).toISOString();
      const startDate = new Date(activeSub.current_period_start * 1000).toISOString();

      // Sync premium_expires_at to profiles
      await supabaseAdmin
        .from("profiles")
        .update({ premium_expires_at: endDate })
        .eq("id", user.id);

      // Grant monthly premium credits (once per billing period)
      const grantRef = `premium_grant_${activeSub.id}_${startDate.slice(0, 10)}`;
      const { data: existingGrant } = await supabaseAdmin
        .from("memocoin_transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("reference_id", grantRef)
        .limit(1);

      if (!existingGrant || existingGrant.length === 0) {
        await supabaseAdmin.rpc("deduct_energy", {
          p_user_id: user.id,
          p_cost: -MONTHLY_PREMIUM_GRANT,
        });
        await supabaseAdmin.from("memocoin_transactions").insert({
          user_id: user.id,
          amount: MONTHLY_PREMIUM_GRANT,
          type: "credit",
          description: MONTHLY_GRANT_DESCRIPTION,
          reference_id: grantRef,
        });
      }

      const productId = activeSub.items.data[0].price.product;
      const plan = productId === "prod_U0RyXil8BOtEyS" ? "annual" : "monthly";

      return new Response(JSON.stringify({
        subscribed: true,
        plan,
        subscription_end: endDate,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for completed lifetime one-time purchase
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      status: "complete",
      limit: 50,
    });

    const lifetimeSession = sessions.data.find((s) => {
      return s.metadata?.user_id === user.id && s.mode === "payment";
    });

    if (lifetimeSession) {
      // Verify it was a lifetime purchase by checking line items
      const lineItems = await stripe.checkout.sessions.listLineItems(lifetimeSession.id);
      const isLifetime = lineItems.data.some((li) => {
        const priceObj = li.price;
        return priceObj && typeof priceObj.product === "string" && priceObj.product === LIFETIME_PRODUCT_ID;
      });

      if (isLifetime) {
        const farFuture = "2099-12-31T23:59:59.000Z";
        await supabaseAdmin
          .from("profiles")
          .update({ premium_expires_at: farFuture })
          .eq("id", user.id);

        // Grant bonus credits (only once - check if already granted)
        const { data: existing } = await supabaseAdmin
          .from("memocoin_transactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("description", "Bônus Vitalício: 50.000 créditos IA")
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabaseAdmin.from("profiles").update({
            energy: LIFETIME_BONUS_CREDITS,
          }).eq("id", user.id);

          await supabaseAdmin.from("memocoin_transactions").insert({
            user_id: user.id,
            amount: LIFETIME_BONUS_CREDITS,
            type: "credit",
            description: "Bônus Vitalício: 50.000 créditos IA",
          });
        }

        return new Response(JSON.stringify({
          subscribed: true,
          plan: "lifetime",
          subscription_end: farFuture,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check for credit pack purchases (to add energy)
    const creditSessions = sessions.data.filter(
      (s) => s.mode === "payment" && s.metadata?.user_id === user.id && s.payment_status === "paid"
    );

    for (const cs of creditSessions) {
      const lineItems = await stripe.checkout.sessions.listLineItems(cs.id);
      for (const li of lineItems.data) {
        const priceObj = li.price;
        if (!priceObj || typeof priceObj.product !== "string") continue;
        if (priceObj.product === LIFETIME_PRODUCT_ID) continue;

        // Check if already processed
        const { data: processed } = await supabaseAdmin
          .from("memocoin_transactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("reference_id", cs.id)
          .limit(1);

        if (!processed || processed.length === 0) {
          // Map product to credits
          const creditMap: Record<string, number> = {
            "prod_U0S0ho3u6BArA4": 100,
            "prod_U0S03WQFbKCXIA": 200,
            "prod_U0S0V6wgfqAI6a": 500,
            "prod_U0S0AdS1CN2q5F": 1000,
          };
          const credits = creditMap[priceObj.product];
          if (credits) {
            // Add credits atomically
            const { data: currentProfile } = await supabaseAdmin
              .from("profiles")
              .select("energy")
              .eq("id", user.id)
              .single();

            await supabaseAdmin.from("profiles").update({
              energy: (currentProfile?.energy ?? 0) + credits,
            }).eq("id", user.id);

            await supabaseAdmin.from("memocoin_transactions").insert({
              user_id: user.id,
              amount: credits,
              type: "credit",
              description: `Compra: ${credits} créditos IA`,
              reference_id: cs.id,
            });
          }
        }
      }
    }

    // No active subscription, update profile
    if (!isCurrentlyLifetime) {
      // Only clear if the premium has expired
      if (currentExpiry && new Date(currentExpiry) < new Date()) {
        await supabaseAdmin
          .from("profiles")
          .update({ premium_expires_at: null })
          .eq("id", user.id);
      }
    }

    return new Response(JSON.stringify({ subscribed: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[check-subscription] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
