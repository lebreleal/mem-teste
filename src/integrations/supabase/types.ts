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
      ai_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_prompts: {
        Row: {
          default_model: string
          feature_key: string
          id: string
          label: string
          system_prompt: string
          temperature: number
          updated_at: string
          user_prompt_template: string
        }
        Insert: {
          default_model?: string
          feature_key: string
          id?: string
          label?: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
          user_prompt_template?: string
        }
        Update: {
          default_model?: string
          feature_key?: string
          id?: string
          label?: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
          user_prompt_template?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      ai_token_usage: {
        Row: {
          completion_tokens: number
          created_at: string
          energy_cost: number
          feature_key: string
          id: string
          model: string
          prompt_tokens: number
          total_tokens: number
          user_id: string
        }
        Insert: {
          completion_tokens?: number
          created_at?: string
          energy_cost?: number
          feature_key: string
          id?: string
          model: string
          prompt_tokens?: number
          total_tokens?: number
          user_id: string
        }
        Update: {
          completion_tokens?: number
          created_at?: string
          energy_cost?: number
          feature_key?: string
          id?: string
          model?: string
          prompt_tokens?: number
          total_tokens?: number
          user_id?: string
        }
        Relationships: []
      }
      app_error_logs: {
        Row: {
          component_name: string | null
          created_at: string
          error_message: string
          error_stack: string | null
          id: string
          metadata: Json | null
          route: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          component_name?: string | null
          created_at?: string
          error_message?: string
          error_stack?: string | null
          id?: string
          metadata?: Json | null
          route?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          component_name?: string | null
          created_at?: string
          error_message?: string
          error_stack?: string | null
          id?: string
          metadata?: Json | null
          route?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      card_tags: {
        Row: {
          added_by: string | null
          card_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          added_by?: string | null
          card_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          added_by?: string | null
          card_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_tags_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          back_content: string
          card_type: string
          created_at: string
          deck_id: string
          difficulty: number
          front_content: string
          id: string
          last_reviewed_at: string | null
          learning_step: number
          scheduled_date: string
          stability: number
          state: number
          updated_at: string
        }
        Insert: {
          back_content: string
          card_type?: string
          created_at?: string
          deck_id: string
          difficulty?: number
          front_content: string
          id?: string
          last_reviewed_at?: string | null
          learning_step?: number
          scheduled_date?: string
          stability?: number
          state?: number
          updated_at?: string
        }
        Update: {
          back_content?: string
          card_type?: string
          created_at?: string
          deck_id?: string
          difficulty?: number
          front_content?: string
          id?: string
          last_reviewed_at?: string | null
          learning_step?: number
          scheduled_date?: string
          stability?: number
          state?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      community_revenue_logs: {
        Row: {
          community_id: string
          created_at: string
          id: string
          owner_amount: number
          owner_user_id: string
          platform_amount: number
          platform_fee_pct: number
          status: string
          stripe_payment_intent_id: string | null
          subscriber_user_id: string
          subscription_id: string | null
          total_amount: number
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          owner_amount?: number
          owner_user_id: string
          platform_amount?: number
          platform_fee_pct?: number
          status?: string
          stripe_payment_intent_id?: string | null
          subscriber_user_id: string
          subscription_id?: string | null
          total_amount?: number
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          owner_amount?: number
          owner_user_id?: string
          platform_amount?: number
          platform_fee_pct?: number
          status?: string
          stripe_payment_intent_id?: string | null
          subscriber_user_id?: string
          subscription_id?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_revenue_logs_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_revenue_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "turma_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_cards: {
        Row: {
          card_id: string
          concept_id: string
          created_at: string
          id: string
        }
        Insert: {
          card_id: string
          concept_id: string
          created_at?: string
          id?: string
        }
        Update: {
          card_id?: string
          concept_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_cards_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "deck_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_concept_mastery: {
        Row: {
          concept: string
          correct_count: number
          deck_id: string
          id: string
          mastery_level: string
          updated_at: string
          user_id: string
          wrong_count: number
        }
        Insert: {
          concept: string
          correct_count?: number
          deck_id: string
          id?: string
          mastery_level?: string
          updated_at?: string
          user_id: string
          wrong_count?: number
        }
        Update: {
          concept?: string
          correct_count?: number
          deck_id?: string
          id?: string
          mastery_level?: string
          updated_at?: string
          user_id?: string
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_concept_mastery_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_concepts: {
        Row: {
          created_at: string
          deck_id: string
          difficulty: number
          id: string
          last_reviewed_at: string | null
          learning_step: number
          name: string
          scheduled_date: string
          sort_order: number
          stability: number
          state: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          difficulty?: number
          id?: string
          last_reviewed_at?: string | null
          learning_step?: number
          name: string
          scheduled_date?: string
          sort_order?: number
          stability?: number
          state?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          difficulty?: number
          id?: string
          last_reviewed_at?: string | null
          learning_step?: number
          name?: string
          scheduled_date?: string
          sort_order?: number
          stability?: number
          state?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_concepts_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_question_attempts: {
        Row: {
          answered_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_indices: number[] | null
          user_answer: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          id?: string
          is_correct?: boolean
          question_id: string
          selected_indices?: number[] | null
          user_answer?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_indices?: number[] | null
          user_answer?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_question_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "deck_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_questions: {
        Row: {
          concepts: string[] | null
          correct_answer: string
          correct_indices: number[] | null
          created_at: string
          created_by: string
          deck_id: string
          explanation: string
          id: string
          options: Json | null
          question_text: string
          question_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          concepts?: string[] | null
          correct_answer?: string
          correct_indices?: number[] | null
          created_at?: string
          created_by: string
          deck_id: string
          explanation?: string
          id?: string
          options?: Json | null
          question_text?: string
          question_type?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          concepts?: string[] | null
          correct_answer?: string
          correct_indices?: number[] | null
          created_at?: string
          created_by?: string
          deck_id?: string
          explanation?: string
          id?: string
          options?: Json | null
          question_text?: string
          question_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_questions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          listing_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_suggestions: {
        Row: {
          card_id: string | null
          content_status: string
          created_at: string
          deck_id: string
          id: string
          moderator_user_id: string | null
          rationale: string
          status: string
          suggested_content: Json
          suggested_tags: Json | null
          suggester_user_id: string
          suggestion_type: string
          tags_status: string
          updated_at: string
        }
        Insert: {
          card_id?: string | null
          content_status?: string
          created_at?: string
          deck_id: string
          id?: string
          moderator_user_id?: string | null
          rationale?: string
          status?: string
          suggested_content?: Json
          suggested_tags?: Json | null
          suggester_user_id: string
          suggestion_type?: string
          tags_status?: string
          updated_at?: string
        }
        Update: {
          card_id?: string | null
          content_status?: string
          created_at?: string
          deck_id?: string
          id?: string
          moderator_user_id?: string | null
          rationale?: string
          status?: string
          suggested_content?: Json
          suggested_tags?: Json | null
          suggester_user_id?: string
          suggestion_type?: string
          tags_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_suggestions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_suggestions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_tags: {
        Row: {
          added_by: string | null
          created_at: string
          deck_id: string
          id: string
          tag_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          deck_id: string
          id?: string
          tag_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          deck_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_tags_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          algorithm_mode: string
          allow_duplication: boolean
          bury_learning_siblings: boolean
          bury_new_siblings: boolean
          bury_review_siblings: boolean
          bury_siblings: boolean
          community_id: string | null
          created_at: string
          daily_new_limit: number
          daily_review_limit: number
          easy_bonus: number
          easy_graduating_interval: number
          folder_id: string | null
          id: string
          interval_modifier: number
          is_archived: boolean
          is_free_in_community: boolean
          is_live_deck: boolean
          is_public: boolean
          learning_steps: string[]
          max_interval: number
          name: string
          parent_deck_id: string | null
          requested_retention: number
          shuffle_cards: boolean
          sort_order: number
          source_listing_id: string | null
          source_turma_deck_id: string | null
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          algorithm_mode?: string
          allow_duplication?: boolean
          bury_learning_siblings?: boolean
          bury_new_siblings?: boolean
          bury_review_siblings?: boolean
          bury_siblings?: boolean
          community_id?: string | null
          created_at?: string
          daily_new_limit?: number
          daily_review_limit?: number
          easy_bonus?: number
          easy_graduating_interval?: number
          folder_id?: string | null
          id?: string
          interval_modifier?: number
          is_archived?: boolean
          is_free_in_community?: boolean
          is_live_deck?: boolean
          is_public?: boolean
          learning_steps?: string[]
          max_interval?: number
          name: string
          parent_deck_id?: string | null
          requested_retention?: number
          shuffle_cards?: boolean
          sort_order?: number
          source_listing_id?: string | null
          source_turma_deck_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          algorithm_mode?: string
          allow_duplication?: boolean
          bury_learning_siblings?: boolean
          bury_new_siblings?: boolean
          bury_review_siblings?: boolean
          bury_siblings?: boolean
          community_id?: string | null
          created_at?: string
          daily_new_limit?: number
          daily_review_limit?: number
          easy_bonus?: number
          easy_graduating_interval?: number
          folder_id?: string | null
          id?: string
          interval_modifier?: number
          is_archived?: boolean
          is_free_in_community?: boolean
          is_live_deck?: boolean
          is_public?: boolean
          learning_steps?: string[]
          max_interval?: number
          name?: string
          parent_deck_id?: string | null
          requested_retention?: number
          shuffle_cards?: boolean
          sort_order?: number
          source_listing_id?: string | null
          source_turma_deck_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decks_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_parent_deck_id_fkey"
            columns: ["parent_deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_source_listing_id_fkey"
            columns: ["source_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_source_turma_deck_id_fkey"
            columns: ["source_turma_deck_id"]
            isOneToOne: false
            referencedRelation: "turma_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_folders: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          name: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          name: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          name?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "exam_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          ai_feedback: string | null
          card_id: string | null
          correct_answer: string
          correct_indices: number[] | null
          created_at: string
          exam_id: string
          id: string
          is_graded: boolean
          options: Json | null
          points: number
          question_text: string
          question_type: string
          scored_points: number
          selected_indices: number[] | null
          sort_order: number
          user_answer: string | null
        }
        Insert: {
          ai_feedback?: string | null
          card_id?: string | null
          correct_answer?: string
          correct_indices?: number[] | null
          created_at?: string
          exam_id: string
          id?: string
          is_graded?: boolean
          options?: Json | null
          points?: number
          question_text: string
          question_type?: string
          scored_points?: number
          selected_indices?: number[] | null
          sort_order?: number
          user_answer?: string | null
        }
        Update: {
          ai_feedback?: string | null
          card_id?: string | null
          correct_answer?: string
          correct_indices?: number[] | null
          created_at?: string
          exam_id?: string
          id?: string
          is_graded?: boolean
          options?: Json | null
          points?: number
          question_text?: string
          question_type?: string
          scored_points?: number
          selected_indices?: number[] | null
          sort_order?: number
          user_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          completed_at: string | null
          created_at: string
          deck_id: string | null
          folder_id: string | null
          id: string
          scored_points: number
          source_turma_exam_id: string | null
          started_at: string
          status: string
          synced_at: string | null
          time_limit_seconds: number | null
          title: string
          total_points: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deck_id?: string | null
          folder_id?: string | null
          id?: string
          scored_points?: number
          source_turma_exam_id?: string | null
          started_at?: string
          status?: string
          synced_at?: string | null
          time_limit_seconds?: number | null
          title?: string
          total_points?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deck_id?: string | null
          folder_id?: string | null
          id?: string
          scored_points?: number
          source_turma_exam_id?: string | null
          started_at?: string
          status?: string
          synced_at?: string | null
          time_limit_seconds?: number | null
          title?: string
          total_points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "exam_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_source_turma_exam_id_fkey"
            columns: ["source_turma_exam_id"]
            isOneToOne: false
            referencedRelation: "turma_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_comments: {
        Row: {
          content: string
          created_at: string
          feature_id: string
          id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          feature_id: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          feature_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_comments_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          status: string
          title: string
          updated_at: string
          user_id: string
          vote_count: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
          vote_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          vote_count?: number
        }
        Relationships: []
      }
      feature_votes: {
        Row: {
          created_at: string
          feature_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_votes_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          name: string
          parent_id: string | null
          section: string
          sort_order: number
          source_turma_id: string | null
          source_turma_subject_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          name: string
          parent_id?: string | null
          section?: string
          sort_order?: number
          source_turma_id?: string | null
          source_turma_subject_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          name?: string
          parent_id?: string | null
          section?: string
          sort_order?: number
          source_turma_id?: string | null
          source_turma_subject_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_source_turma_id_fkey"
            columns: ["source_turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_source_turma_subject_id_fkey"
            columns: ["source_turma_subject_id"]
            isOneToOne: false
            referencedRelation: "turma_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      global_concepts: {
        Row: {
          category: string | null
          concept_tag_id: string | null
          correct_count: number
          created_at: string
          difficulty: number
          id: string
          last_reviewed_at: string | null
          learning_step: number
          name: string
          parent_concept_id: string | null
          scheduled_date: string
          slug: string
          stability: number
          state: number
          subcategory: string | null
          updated_at: string
          user_id: string
          wrong_count: number
        }
        Insert: {
          category?: string | null
          concept_tag_id?: string | null
          correct_count?: number
          created_at?: string
          difficulty?: number
          id?: string
          last_reviewed_at?: string | null
          learning_step?: number
          name: string
          parent_concept_id?: string | null
          scheduled_date?: string
          slug: string
          stability?: number
          state?: number
          subcategory?: string | null
          updated_at?: string
          user_id: string
          wrong_count?: number
        }
        Update: {
          category?: string | null
          concept_tag_id?: string | null
          correct_count?: number
          created_at?: string
          difficulty?: number
          id?: string
          last_reviewed_at?: string | null
          learning_step?: number
          name?: string
          parent_concept_id?: string | null
          scheduled_date?: string
          slug?: string
          stability?: number
          state?: number
          subcategory?: string | null
          updated_at?: string
          user_id?: string
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "global_concepts_concept_tag_id_fkey"
            columns: ["concept_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_concepts_parent_concept_id_fkey"
            columns: ["parent_concept_id"]
            isOneToOne: false
            referencedRelation: "global_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_content_folders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          lesson_id: string
          name: string
          parent_id: string | null
          sort_order: number
          turma_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          lesson_id: string
          name: string
          parent_id?: string | null
          sort_order?: number
          turma_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          lesson_id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          turma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_content_folders_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "turma_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_content_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "lesson_content_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_content_folders_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          avg_rating: number | null
          card_count: number
          category: string
          created_at: string
          deck_id: string
          description: string | null
          downloads: number
          id: string
          is_free: boolean
          is_published: boolean
          price: number
          rating_count: number
          seller_id: string
          title: string
          updated_at: string
        }
        Insert: {
          avg_rating?: number | null
          card_count?: number
          category?: string
          created_at?: string
          deck_id: string
          description?: string | null
          downloads?: number
          id?: string
          is_free?: boolean
          is_published?: boolean
          price?: number
          rating_count?: number
          seller_id: string
          title: string
          updated_at?: string
        }
        Update: {
          avg_rating?: number | null
          card_count?: number
          category?: string
          created_at?: string
          deck_id?: string
          description?: string | null
          downloads?: number
          id?: string
          is_free?: boolean
          is_published?: boolean
          price?: number
          rating_count?: number
          seller_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_purchases: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          listing_id: string
          price_paid: number
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          listing_id: string
          price_paid?: number
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          price_paid?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_purchases_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      memocoin_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string
          id?: string
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      mission_definitions: {
        Row: {
          category: string
          created_at: string
          description: string
          icon: string
          id: string
          is_active: boolean
          key: string
          reward_credits: number
          sort_order: number
          target_type: string
          target_value: number
          title: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          key: string
          reward_credits?: number
          sort_order?: number
          target_type?: string
          target_value?: number
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          key?: string
          reward_credits?: number
          sort_order?: number
          target_type?: string
          target_value?: number
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          creator_tier: number
          current_streak: number
          daily_cards_studied: number
          daily_energy_earned: number
          daily_free_gradings: number
          daily_new_cards_limit: number
          daily_study_minutes: number
          email: string
          energy: number
          forecast_view: string
          id: string
          is_banned: boolean
          is_profile_public: boolean
          last_energy_recharge: string | null
          last_grading_reset_date: string | null
          last_study_reset_date: string | null
          memocoins: number
          name: string
          onboarding_completed: boolean
          premium_expires_at: string | null
          selected_plan_id: string | null
          successful_cards_counter: number
          tier_last_evaluated: string | null
          updated_at: string
          weekly_new_cards: Json | null
          weekly_study_minutes: Json | null
        }
        Insert: {
          created_at?: string
          creator_tier?: number
          current_streak?: number
          daily_cards_studied?: number
          daily_energy_earned?: number
          daily_free_gradings?: number
          daily_new_cards_limit?: number
          daily_study_minutes?: number
          email?: string
          energy?: number
          forecast_view?: string
          id: string
          is_banned?: boolean
          is_profile_public?: boolean
          last_energy_recharge?: string | null
          last_grading_reset_date?: string | null
          last_study_reset_date?: string | null
          memocoins?: number
          name?: string
          onboarding_completed?: boolean
          premium_expires_at?: string | null
          selected_plan_id?: string | null
          successful_cards_counter?: number
          tier_last_evaluated?: string | null
          updated_at?: string
          weekly_new_cards?: Json | null
          weekly_study_minutes?: Json | null
        }
        Update: {
          created_at?: string
          creator_tier?: number
          current_streak?: number
          daily_cards_studied?: number
          daily_energy_earned?: number
          daily_free_gradings?: number
          daily_new_cards_limit?: number
          daily_study_minutes?: number
          email?: string
          energy?: number
          forecast_view?: string
          id?: string
          is_banned?: boolean
          is_profile_public?: boolean
          last_energy_recharge?: string | null
          last_grading_reset_date?: string | null
          last_study_reset_date?: string | null
          memocoins?: number
          name?: string
          onboarding_completed?: boolean
          premium_expires_at?: string | null
          selected_plan_id?: string | null
          successful_cards_counter?: number
          tier_last_evaluated?: string | null
          updated_at?: string
          weekly_new_cards?: Json | null
          weekly_study_minutes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_selected_plan_id_fkey"
            columns: ["selected_plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      question_concepts: {
        Row: {
          concept_id: string
          created_at: string
          id: string
          question_id: string
        }
        Insert: {
          concept_id: string
          created_at?: string
          id?: string
          question_id: string
        }
        Update: {
          concept_id?: string
          created_at?: string
          id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_concepts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "global_concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_concepts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "deck_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_logs: {
        Row: {
          card_id: string
          difficulty: number
          elapsed_ms: number | null
          id: string
          rating: number
          reviewed_at: string
          scheduled_date: string
          stability: number
          state: number | null
          user_id: string
        }
        Insert: {
          card_id: string
          difficulty?: number
          elapsed_ms?: number | null
          id?: string
          rating: number
          reviewed_at?: string
          scheduled_date?: string
          stability?: number
          state?: number | null
          user_id: string
        }
        Update: {
          card_id?: string
          difficulty?: number
          elapsed_ms?: number | null
          id?: string
          rating?: number
          reviewed_at?: string
          scheduled_date?: string
          stability?: number
          state?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_logs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plans: {
        Row: {
          created_at: string
          daily_minutes: number
          deck_ids: string[]
          id: string
          name: string
          priority: number
          target_date: string | null
          updated_at: string
          user_id: string
          weekly_minutes: Json | null
        }
        Insert: {
          created_at?: string
          daily_minutes?: number
          deck_ids?: string[]
          id?: string
          name?: string
          priority?: number
          target_date?: string | null
          updated_at?: string
          user_id: string
          weekly_minutes?: Json | null
        }
        Update: {
          created_at?: string
          daily_minutes?: number
          deck_ids?: string[]
          id?: string
          name?: string
          priority?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
          weekly_minutes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "study_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestion_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          suggestion_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          suggestion_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          suggestion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_comments_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "deck_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestion_votes: {
        Row: {
          created_at: string
          id: string
          suggestion_id: string
          user_id: string
          vote: number
        }
        Insert: {
          created_at?: string
          id?: string
          suggestion_id: string
          user_id: string
          vote: number
        }
        Update: {
          created_at?: string
          id?: string
          suggestion_id?: string
          user_id?: string
          vote?: number
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_votes_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "deck_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_concept: boolean
          is_official: boolean
          merged_into_id: string | null
          name: string
          parent_id: string | null
          slug: string
          synonyms: string[]
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_concept?: boolean
          is_official?: boolean
          merged_into_id?: string | null
          name: string
          parent_id?: string | null
          slug: string
          synonyms?: string[]
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_concept?: boolean
          is_official?: boolean
          merged_into_id?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          synonyms?: string[]
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_decks: {
        Row: {
          allow_download: boolean
          content_folder_id: string | null
          created_at: string
          deck_id: string
          id: string
          is_published: boolean
          lesson_id: string | null
          price: number
          price_type: string
          shared_by: string
          sort_order: number
          subject_id: string | null
          turma_id: string
        }
        Insert: {
          allow_download?: boolean
          content_folder_id?: string | null
          created_at?: string
          deck_id: string
          id?: string
          is_published?: boolean
          lesson_id?: string | null
          price?: number
          price_type?: string
          shared_by: string
          sort_order?: number
          subject_id?: string | null
          turma_id: string
        }
        Update: {
          allow_download?: boolean
          content_folder_id?: string | null
          created_at?: string
          deck_id?: string
          id?: string
          is_published?: boolean
          lesson_id?: string | null
          price?: number
          price_type?: string
          shared_by?: string
          sort_order?: number
          subject_id?: string | null
          turma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_decks_content_folder_id_fkey"
            columns: ["content_folder_id"]
            isOneToOne: false
            referencedRelation: "lesson_content_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_decks_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_decks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "turma_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_decks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "turma_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_decks_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_exam_answers: {
        Row: {
          ai_feedback: string | null
          attempt_id: string
          created_at: string
          id: string
          is_graded: boolean
          question_id: string
          scored_points: number
          selected_indices: number[] | null
          user_answer: string | null
        }
        Insert: {
          ai_feedback?: string | null
          attempt_id: string
          created_at?: string
          id?: string
          is_graded?: boolean
          question_id: string
          scored_points?: number
          selected_indices?: number[] | null
          user_answer?: string | null
        }
        Update: {
          ai_feedback?: string | null
          attempt_id?: string
          created_at?: string
          id?: string
          is_graded?: boolean
          question_id?: string
          scored_points?: number
          selected_indices?: number[] | null
          user_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "turma_exam_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "turma_exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_exam_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "turma_exam_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_exam_attempts: {
        Row: {
          completed_at: string | null
          created_at: string
          exam_id: string
          id: string
          scored_points: number
          started_at: string
          status: string
          total_points: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          exam_id: string
          id?: string
          scored_points?: number
          started_at?: string
          status?: string
          total_points?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          exam_id?: string
          id?: string
          scored_points?: number
          started_at?: string
          status?: string
          total_points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "turma_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_exam_questions: {
        Row: {
          correct_answer: string
          correct_indices: number[] | null
          created_at: string
          exam_id: string
          id: string
          options: Json | null
          points: number
          question_id: string | null
          question_text: string
          question_type: string
          sort_order: number
        }
        Insert: {
          correct_answer?: string
          correct_indices?: number[] | null
          created_at?: string
          exam_id: string
          id?: string
          options?: Json | null
          points?: number
          question_id?: string | null
          question_text: string
          question_type?: string
          sort_order?: number
        }
        Update: {
          correct_answer?: string
          correct_indices?: number[] | null
          created_at?: string
          exam_id?: string
          id?: string
          options?: Json | null
          points?: number
          question_id?: string | null
          question_text?: string
          question_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "turma_exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "turma_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_exam_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "turma_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_exams: {
        Row: {
          avg_rating: number | null
          created_at: string
          created_by: string
          description: string | null
          downloads: number
          id: string
          is_marketplace: boolean
          is_published: boolean
          lesson_id: string | null
          price: number
          rating_count: number
          sort_order: number
          subject_id: string | null
          subscribers_only: boolean
          time_limit_seconds: number | null
          title: string
          total_questions: number
          turma_id: string
          updated_at: string
        }
        Insert: {
          avg_rating?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          downloads?: number
          id?: string
          is_marketplace?: boolean
          is_published?: boolean
          lesson_id?: string | null
          price?: number
          rating_count?: number
          sort_order?: number
          subject_id?: string | null
          subscribers_only?: boolean
          time_limit_seconds?: number | null
          title: string
          total_questions?: number
          turma_id: string
          updated_at?: string
        }
        Update: {
          avg_rating?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          downloads?: number
          id?: string
          is_marketplace?: boolean
          is_published?: boolean
          lesson_id?: string | null
          price?: number
          rating_count?: number
          sort_order?: number
          subject_id?: string | null
          subscribers_only?: boolean
          time_limit_seconds?: number | null
          title?: string
          total_questions?: number
          turma_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_exams_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "turma_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "turma_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_exams_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_lesson_files: {
        Row: {
          content_folder_id: string | null
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          lesson_id: string
          price_type: string
          sort_order: number
          turma_id: string
          uploaded_by: string
        }
        Insert: {
          content_folder_id?: string | null
          created_at?: string
          file_name: string
          file_size?: number
          file_type?: string
          file_url: string
          id?: string
          lesson_id: string
          price_type?: string
          sort_order?: number
          turma_id: string
          uploaded_by: string
        }
        Update: {
          content_folder_id?: string | null
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          lesson_id?: string
          price_type?: string
          sort_order?: number
          turma_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_lesson_files_content_folder_id_fkey"
            columns: ["content_folder_id"]
            isOneToOne: false
            referencedRelation: "lesson_content_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_lesson_files_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "turma_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_lesson_files_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_lessons: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_published: boolean
          lesson_date: string | null
          materials: Json | null
          name: string
          sort_order: number
          subject_id: string | null
          summary: string | null
          turma_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_published?: boolean
          lesson_date?: string | null
          materials?: Json | null
          name: string
          sort_order?: number
          subject_id?: string | null
          summary?: string | null
          turma_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_published?: boolean
          lesson_date?: string | null
          materials?: Json | null
          name?: string
          sort_order?: number
          subject_id?: string | null
          summary?: string | null
          turma_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "turma_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_lessons_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_members: {
        Row: {
          id: string
          is_subscriber: boolean
          joined_at: string
          role: Database["public"]["Enums"]["turma_role"]
          turma_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_subscriber?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["turma_role"]
          turma_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_subscriber?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["turma_role"]
          turma_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_members_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_permissions: {
        Row: {
          created_at: string
          granted: boolean
          granted_by: string
          id: string
          permission: string
          turma_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          granted_by: string
          id?: string
          permission: string
          turma_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          granted_by?: string
          id?: string
          permission?: string
          turma_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_permissions_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_questions: {
        Row: {
          correct_answer: string
          correct_indices: number[] | null
          created_at: string
          created_by: string
          id: string
          lesson_id: string | null
          options: Json | null
          points: number
          question_text: string
          question_type: string
          subject_id: string | null
          turma_id: string
          updated_at: string
        }
        Insert: {
          correct_answer?: string
          correct_indices?: number[] | null
          created_at?: string
          created_by: string
          id?: string
          lesson_id?: string | null
          options?: Json | null
          points?: number
          question_text: string
          question_type?: string
          subject_id?: string | null
          turma_id: string
          updated_at?: string
        }
        Update: {
          correct_answer?: string
          correct_indices?: number[] | null
          created_at?: string
          created_by?: string
          id?: string
          lesson_id?: string | null
          options?: Json | null
          points?: number
          question_text?: string
          question_type?: string
          subject_id?: string | null
          turma_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "turma_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "turma_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_questions_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          turma_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          turma_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          turma_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_ratings_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_semesters: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          sort_order: number
          turma_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          turma_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          turma_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_semesters_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_subjects: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          semester_id: string | null
          sort_order: number
          turma_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          semester_id?: string | null
          sort_order?: number
          turma_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          semester_id?: string | null
          sort_order?: number
          turma_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_subjects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "turma_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_subjects_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "turma_semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_subjects_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_subscriptions: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          id: string
          plan_type: string
          started_at: string
          status: string
          turma_id: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          plan_type?: string
          started_at?: string
          status?: string
          turma_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          plan_type?: string
          started_at?: string
          status?: string
          turma_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turma_subscriptions_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turmas: {
        Row: {
          avg_rating: number | null
          category: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          invite_code: string
          is_private: boolean
          name: string
          owner_id: string
          rating_count: number
          share_slug: string | null
          subscription_price: number
          subscription_price_yearly: number
          updated_at: string
        }
        Insert: {
          avg_rating?: number | null
          category?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          is_private?: boolean
          name: string
          owner_id: string
          rating_count?: number
          share_slug?: string | null
          subscription_price?: number
          subscription_price_yearly?: number
          updated_at?: string
        }
        Update: {
          avg_rating?: number | null
          category?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          is_private?: boolean
          name?: string
          owner_id?: string
          rating_count?: number
          share_slug?: string | null
          subscription_price?: number
          subscription_price_yearly?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_card_metadata: {
        Row: {
          card_id: string
          created_at: string
          id: string
          personal_notes: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          personal_notes?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          personal_notes?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_card_metadata_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      user_missions: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          is_claimed: boolean
          is_completed: boolean
          mission_id: string
          period_start: string
          progress: number
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          is_completed?: boolean
          mission_id: string
          period_start?: string
          progress?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          is_completed?: boolean
          mission_id?: string
          period_start?: string
          progress?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_missions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "mission_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_global_token_usage: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_user_id?: string
        }
        Returns: {
          completion_tokens: number
          created_at: string
          energy_cost: number
          feature_key: string
          id: string
          model: string
          prompt_tokens: number
          total_tokens: number
          user_email: string
          user_id: string
          user_name: string
        }[]
      }
      admin_get_profiles: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          created_at: string
          creator_tier: number
          daily_cards_studied: number
          email: string
          energy: number
          id: string
          is_banned: boolean
          memocoins: number
          name: string
          onboarding_completed: boolean
          premium_expires_at: string
          successful_cards_counter: number
        }[]
      }
      admin_get_user_decks: {
        Args: { p_user_id: string }
        Returns: {
          card_count: number
          created_at: string
          id: string
          is_archived: boolean
          name: string
        }[]
      }
      admin_get_user_study_history: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          avg_rating: number
          cards_reviewed: number
          study_date: string
        }[]
      }
      admin_get_user_token_usage: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          feature_key: string
          model: string
          total_calls: number
          total_completion_tokens: number
          total_energy_cost: number
          total_prompt_tokens: number
          total_tokens_sum: number
        }[]
      }
      admin_get_user_token_usage_detailed: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          completion_tokens: number
          created_at: string
          energy_cost: number
          feature_key: string
          id: string
          model: string
          prompt_tokens: number
          total_tokens: number
        }[]
      }
      admin_update_profile:
        | {
            Args: {
              p_energy?: number
              p_is_banned?: boolean
              p_memocoins?: number
              p_name?: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_energy?: number
              p_is_banned?: boolean
              p_memocoins?: number
              p_name?: string
              p_premium_expires_at?: string
              p_user_id: string
            }
            Returns: undefined
          }
      batch_reorder_decks: {
        Args: { p_deck_ids: string[] }
        Returns: undefined
      }
      count_cards_per_deck: {
        Args: { p_deck_ids: string[] }
        Returns: {
          card_count: number
          deck_id: string
        }[]
      }
      count_descendant_cards_by_state: {
        Args: { p_deck_id: string }
        Returns: Json
      }
      deduct_energy: {
        Args: { p_cost: number; p_user_id: string }
        Returns: number
      }
      delete_deck_cascade: { Args: { p_deck_id: string }; Returns: undefined }
      delete_folder_cascade: {
        Args: { p_folder_id: string }
        Returns: undefined
      }
      delete_lesson_cascade: {
        Args: { p_lesson_id: string }
        Returns: undefined
      }
      delete_subject_cascade: {
        Args: { p_subject_id: string }
        Returns: undefined
      }
      delete_turma_exam_cascade: {
        Args: { p_exam_id: string }
        Returns: undefined
      }
      find_turma_by_invite_code: {
        Args: { p_invite_code: string }
        Returns: {
          avg_rating: number
          cover_image_url: string
          description: string
          id: string
          is_private: boolean
          name: string
          owner_id: string
          rating_count: number
          subscription_price: number
        }[]
      }
      generate_tag_slug: { Args: { p_name: string }; Returns: string }
      get_activity_daily_breakdown: {
        Args: {
          p_days?: number
          p_tz_offset_minutes?: number
          p_user_id: string
        }
        Returns: Json
      }
      get_all_user_deck_stats: {
        Args: { p_tz_offset_minutes?: number; p_user_id: string }
        Returns: {
          deck_id: string
          learning_count: number
          new_count: number
          new_graduated_today: number
          new_reviewed_today: number
          review_count: number
          reviewed_today: number
        }[]
      }
      get_avg_seconds_per_card: { Args: { p_user_id: string }; Returns: number }
      get_card_statistics: { Args: { p_user_id: string }; Returns: Json }
      get_cards_added_per_day: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          added: number
          day: string
        }[]
      }
      get_community_deck_updates: {
        Args: { p_user_id: string }
        Returns: {
          has_update: boolean
          local_deck_id: string
        }[]
      }
      get_community_full_preview: {
        Args: { p_turma_id: string }
        Returns: Json
      }
      get_community_preview_stats: {
        Args: { p_turma_id: string }
        Returns: Json
      }
      get_deck_stats: {
        Args: { p_deck_id: string; p_tz_offset_minutes?: number }
        Returns: {
          learning_count: number
          new_count: number
          new_graduated_today: number
          new_reviewed_today: number
          review_count: number
          reviewed_today: number
        }[]
      }
      get_descendant_cards_page: {
        Args: { p_deck_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          back_content: string
          card_type: string
          created_at: string
          deck_id: string
          difficulty: number
          front_content: string
          id: string
          last_reviewed_at: string | null
          learning_step: number
          scheduled_date: string
          stability: number
          state: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_forecast_params: {
        Args: { p_deck_ids: string[]; p_user_id: string }
        Returns: Json
      }
      get_hourly_breakdown: {
        Args: {
          p_days?: number
          p_tz_offset_minutes?: number
          p_user_id: string
        }
        Returns: Json
      }
      get_marketplace_fee: { Args: { tier: number }; Returns: number }
      get_plan_metrics: {
        Args: { p_deck_ids: string[]; p_user_id: string }
        Returns: {
          total_learning: number
          total_new: number
          total_review: number
        }[]
      }
      get_public_profile_stats: { Args: { p_user_id: string }; Returns: Json }
      get_public_profiles: {
        Args: { p_user_ids: string[] }
        Returns: {
          creator_tier: number
          id: string
          name: string
        }[]
      }
      get_retention_over_time: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          correct: number
          total: number
          week_start: string
        }[]
      }
      get_study_queue_limits: {
        Args: {
          p_card_ids: string[]
          p_tz_offset_minutes?: number
          p_user_id: string
        }
        Returns: {
          new_reviewed_today: number
          review_reviewed_today: number
        }[]
      }
      get_study_stats_summary: {
        Args: { p_tz_offset_minutes?: number; p_user_id: string }
        Returns: Json
      }
      get_turma_role: {
        Args: { _turma_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["turma_role"]
      }
      get_user_performance_summary: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_user_ranking: {
        Args: never
        Returns: {
          cards_30d: number
          current_streak: number
          minutes_30d: number
          user_id: string
          user_name: string
        }[]
      }
      get_user_real_study_metrics: {
        Args: { p_user_id: string }
        Returns: {
          actual_daily_minutes: number
          avg_lapse_rate: number
          avg_learning_seconds: number
          avg_new_seconds: number
          avg_relearning_seconds: number
          avg_review_seconds: number
          avg_reviews_per_new_card: number
          total_reviews_90d: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_turma_permission: {
        Args: { _permission: string; _turma_id: string; _user_id: string }
        Returns: boolean
      }
      increment_concept_count: {
        Args: { p_concept_id: string; p_field: string }
        Returns: undefined
      }
      insert_review_batch: { Args: { p_reviews: Json }; Returns: undefined }
      is_turma_member: {
        Args: { _turma_id: string; _user_id: string }
        Returns: boolean
      }
      leave_turma: { Args: { _turma_id: string }; Returns: undefined }
      process_marketplace_purchase: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      process_turma_subscription: {
        Args: { p_turma_id: string }
        Returns: Json
      }
      refund_energy: {
        Args: { p_cost: number; p_user_id: string }
        Returns: undefined
      }
      resolve_community_deck_source: {
        Args: { p_deck_id: string }
        Returns: Json
      }
      restore_subscription_status: {
        Args: { p_turma_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
      turma_role: "admin" | "moderator" | "member"
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
    Enums: {
      app_role: ["admin"],
      turma_role: ["admin", "moderator", "member"],
    },
  },
} as const
