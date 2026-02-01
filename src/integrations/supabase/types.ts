export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      gallery_images: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          order_position: number
          updated_at: string
          url: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          order_position?: number
          updated_at?: string
          url: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          order_position?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          pitch: string
          product_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          pitch: string
          product_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          pitch?: string
          product_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          document_number: string
          document_type: string
          email: string | null
          full_name: string
          id: string
          is_admin: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          document_number: string
          document_type: string
          email?: string | null
          full_name: string
          id?: string
          is_admin?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          document_number?: string
          document_type?: string
          email?: string | null
          full_name?: string
          id?: string
          is_admin?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quote_questions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          option_a: string
          option_b: string
          order_position: number
          question: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          option_a: string
          option_b: string
          order_position?: number
          question: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          option_a?: string
          option_b?: string
          order_position?: number
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          admin_notes: string | null
          arrived_port_at: string | null
          cabinet_layout: string
          cabinet_quantity: number
          contract_link: string | null
          contract_signed_at: string | null
          created_at: string
          current_stage: number | null
          current_step: number | null
          customs_cleared_at: string | null
          customs_started_at: string | null
          delivered_at: string | null
          delivery_cep: string
          delivery_city: string | null
          delivery_state: string | null
          id: string
          logo_url: string | null
          pcb_type: string
          pitch: string
          product_type: string
          production_completed_at: string | null
          production_paid_at: string | null
          production_payment_link: string | null
          production_started_at: string | null
          purpose: string
          questionnaire_answers: Json | null
          quote_approved_at: string | null
          quote_pdf_url: string | null
          shipped_at: string | null
          shipping_address_cep: string | null
          shipping_address_city: string | null
          shipping_address_complement: string | null
          shipping_address_neighborhood: string | null
          shipping_address_number: string | null
          shipping_address_state: string | null
          shipping_address_street: string | null
          shipping_form_completed_at: string | null
          shipping_form_link: string | null
          shipping_paid_at: string | null
          shipping_payment_link: string | null
          status: string
          updated_at: string
          user_id: string
          wants_logo: boolean | null
        }
        Insert: {
          admin_notes?: string | null
          arrived_port_at?: string | null
          cabinet_layout: string
          cabinet_quantity: number
          contract_link?: string | null
          contract_signed_at?: string | null
          created_at?: string
          current_stage?: number | null
          current_step?: number | null
          customs_cleared_at?: string | null
          customs_started_at?: string | null
          delivered_at?: string | null
          delivery_cep: string
          delivery_city?: string | null
          delivery_state?: string | null
          id?: string
          logo_url?: string | null
          pcb_type: string
          pitch: string
          product_type: string
          production_completed_at?: string | null
          production_paid_at?: string | null
          production_payment_link?: string | null
          production_started_at?: string | null
          purpose: string
          questionnaire_answers?: Json | null
          quote_approved_at?: string | null
          quote_pdf_url?: string | null
          shipped_at?: string | null
          shipping_address_cep?: string | null
          shipping_address_city?: string | null
          shipping_address_complement?: string | null
          shipping_address_neighborhood?: string | null
          shipping_address_number?: string | null
          shipping_address_state?: string | null
          shipping_address_street?: string | null
          shipping_form_completed_at?: string | null
          shipping_form_link?: string | null
          shipping_paid_at?: string | null
          shipping_payment_link?: string | null
          status?: string
          updated_at?: string
          user_id: string
          wants_logo?: boolean | null
        }
        Update: {
          admin_notes?: string | null
          arrived_port_at?: string | null
          cabinet_layout?: string
          cabinet_quantity?: number
          contract_link?: string | null
          contract_signed_at?: string | null
          created_at?: string
          current_stage?: number | null
          current_step?: number | null
          customs_cleared_at?: string | null
          customs_started_at?: string | null
          delivered_at?: string | null
          delivery_cep?: string
          delivery_city?: string | null
          delivery_state?: string | null
          id?: string
          logo_url?: string | null
          pcb_type?: string
          pitch?: string
          product_type?: string
          production_completed_at?: string | null
          production_paid_at?: string | null
          production_payment_link?: string | null
          production_started_at?: string | null
          purpose?: string
          questionnaire_answers?: Json | null
          quote_approved_at?: string | null
          quote_pdf_url?: string | null
          shipped_at?: string | null
          shipping_address_cep?: string | null
          shipping_address_city?: string | null
          shipping_address_complement?: string | null
          shipping_address_neighborhood?: string | null
          shipping_address_number?: string | null
          shipping_address_state?: string | null
          shipping_address_street?: string | null
          shipping_form_completed_at?: string | null
          shipping_form_link?: string | null
          shipping_paid_at?: string | null
          shipping_payment_link?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          wants_logo?: boolean | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
