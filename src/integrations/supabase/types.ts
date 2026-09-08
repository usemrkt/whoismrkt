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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      abuse_reports: {
        Row: {
          admin_note: string | null
          content_id: string | null
          content_type: string
          created_at: string
          description: string | null
          id: string
          reason: string
          reported_user_id: string | null
          reporter_id: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          content_id?: string | null
          content_type: string
          created_at?: string
          description?: string | null
          id?: string
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          content_id?: string | null
          content_type?: string
          created_at?: string
          description?: string | null
          id?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      admin_action_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          ip_address: string | null
          payload: Json | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_actions: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          meta: Json | null
          note: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          meta?: Json | null
          note?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          note?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          created_at: string
          department: string
          icon: string
          is_active: boolean
          key: string
          name: string
          role_summary: string
        }
        Insert: {
          created_at?: string
          department: string
          icon?: string
          is_active?: boolean
          key: string
          name: string
          role_summary: string
        }
        Update: {
          created_at?: string
          department?: string
          icon?: string
          is_active?: boolean
          key?: string
          name?: string
          role_summary?: string
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credits: {
        Row: {
          created_at: string
          id: string
          is_pro: boolean
          pro_fair_use_ceiling: number
          reset_at: string | null
          total_credits: number
          updated_at: string
          used_credits: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_pro?: boolean
          pro_fair_use_ceiling?: number
          reset_at?: string | null
          total_credits?: number
          updated_at?: string
          used_credits?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_pro?: boolean
          pro_fair_use_ceiling?: number
          reset_at?: string | null
          total_credits?: number
          updated_at?: string
          used_credits?: number
          user_id?: string
        }
        Relationships: []
      }
      ai_recommendations: {
        Row: {
          action: string | null
          created_at: string
          expires_at: string | null
          explanation: string | null
          id: string
          is_done: boolean
          meta: Json | null
          priority: Database["public"]["Enums"]["recommendation_priority"]
          recommendation_type: string
          source: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          expires_at?: string | null
          explanation?: string | null
          id?: string
          is_done?: boolean
          meta?: Json | null
          priority?: Database["public"]["Enums"]["recommendation_priority"]
          recommendation_type: string
          source?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          action?: string | null
          created_at?: string
          expires_at?: string | null
          explanation?: string | null
          id?: string
          is_done?: boolean
          meta?: Json | null
          priority?: Database["public"]["Enums"]["recommendation_priority"]
          recommendation_type?: string
          source?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_request_attempts: {
        Row: {
          ai_request_id: string
          attempt_number: number
          cost_usd: number | null
          created_at: string
          error_class: string | null
          error_message: string | null
          id: string
          input_tokens: number | null
          is_fallback: boolean
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          ai_request_id: string
          attempt_number: number
          cost_usd?: number | null
          created_at?: string
          error_class?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          is_fallback?: boolean
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          provider: string
          status: string
          user_id: string
        }
        Update: {
          ai_request_id?: string
          attempt_number?: number
          cost_usd?: number | null
          created_at?: string
          error_class?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          is_fallback?: boolean
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_request_attempts_ai_request_id_fkey"
            columns: ["ai_request_id"]
            isOneToOne: false
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_requests: {
        Row: {
          asset_url: string | null
          completed_at: string | null
          created_at: string
          credits_charged: number | null
          error_message: string | null
          estimated_cost: number | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          prompt: string | null
          provider: string
          reconciliation_intent: string | null
          reservation_status: string | null
          response: string | null
          status: string
          task_type: string
          user_id: string
        }
        Insert: {
          asset_url?: string | null
          completed_at?: string | null
          created_at?: string
          credits_charged?: number | null
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          prompt?: string | null
          provider: string
          reconciliation_intent?: string | null
          reservation_status?: string | null
          response?: string | null
          status?: string
          task_type: string
          user_id: string
        }
        Update: {
          asset_url?: string | null
          completed_at?: string | null
          created_at?: string
          credits_charged?: number | null
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          prompt?: string | null
          provider?: string
          reconciliation_intent?: string | null
          reservation_status?: string | null
          response?: string | null
          status?: string
          task_type?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_router_daily_usage: {
        Row: {
          provider: string
          request_count: number
          usage_date: string
          user_id: string
        }
        Insert: {
          provider: string
          request_count?: number
          usage_date?: string
          user_id: string
        }
        Update: {
          provider?: string
          request_count?: number
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_snapshots: {
        Row: {
          created_at: string
          engagement_rate: number | null
          follower_growth: number | null
          followers: number | null
          id: string
          impressions: number | null
          platform: Database["public"]["Enums"]["platform"]
          profile_visits: number | null
          reach: number | null
          user_id: string
          views: number | null
        }
        Insert: {
          created_at?: string
          engagement_rate?: number | null
          follower_growth?: number | null
          followers?: number | null
          id?: string
          impressions?: number | null
          platform: Database["public"]["Enums"]["platform"]
          profile_visits?: number | null
          reach?: number | null
          user_id: string
          views?: number | null
        }
        Update: {
          created_at?: string
          engagement_rate?: number | null
          follower_growth?: number | null
          followers?: number | null
          id?: string
          impressions?: number | null
          platform?: Database["public"]["Enums"]["platform"]
          profile_visits?: number | null
          reach?: number | null
          user_id?: string
          views?: number | null
        }
        Relationships: []
      }
      automated_spend_budgets: {
        Row: {
          business_id: string
          consumed_usd: number
          feature: string
          id: string
          monthly_cap_usd: number
          period_start: string
          updated_at: string
        }
        Insert: {
          business_id: string
          consumed_usd?: number
          feature: string
          id?: string
          monthly_cap_usd?: number
          period_start?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          consumed_usd?: number
          feature?: string
          id?: string
          monthly_cap_usd?: number
          period_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_documents: {
        Row: {
          business_user_id: string
          created_at: string
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
        }
        Insert: {
          business_user_id: string
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
        }
        Update: {
          business_user_id?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
        }
        Relationships: []
      }
      brand_knowledge: {
        Row: {
          brand_description: string | null
          brand_guidelines: string | null
          brand_voice: string | null
          business_user_id: string
          competitors: string | null
          content_pillars: string | null
          current_marketing_challenges: string | null
          current_social_channels: string | null
          id: string
          links: Json
          marketing_budget_range: string | null
          marketing_goals: string | null
          preferred_growth_channels: string | null
          products: string | null
          revenue_range: string | null
          services: string | null
          target_audience: string | null
          updated_at: string
        }
        Insert: {
          brand_description?: string | null
          brand_guidelines?: string | null
          brand_voice?: string | null
          business_user_id: string
          competitors?: string | null
          content_pillars?: string | null
          current_marketing_challenges?: string | null
          current_social_channels?: string | null
          id?: string
          links?: Json
          marketing_budget_range?: string | null
          marketing_goals?: string | null
          preferred_growth_channels?: string | null
          products?: string | null
          revenue_range?: string | null
          services?: string | null
          target_audience?: string | null
          updated_at?: string
        }
        Update: {
          brand_description?: string | null
          brand_guidelines?: string | null
          brand_voice?: string | null
          business_user_id?: string
          competitors?: string | null
          content_pillars?: string | null
          current_marketing_challenges?: string | null
          current_social_channels?: string | null
          id?: string
          links?: Json
          marketing_budget_range?: string | null
          marketing_goals?: string | null
          preferred_growth_channels?: string | null
          products?: string | null
          revenue_range?: string | null
          services?: string | null
          target_audience?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      business_autonomy_policy: {
        Row: {
          auto_execute_safe_tasks: boolean
          autonomy_level: number
          business_id: string
          max_auto_spend_usd_per_task: number
          proactive_missions_enabled: boolean
          updated_at: string
        }
        Insert: {
          auto_execute_safe_tasks?: boolean
          autonomy_level?: number
          business_id: string
          max_auto_spend_usd_per_task?: number
          proactive_missions_enabled?: boolean
          updated_at?: string
        }
        Update: {
          auto_execute_safe_tasks?: boolean
          autonomy_level?: number
          business_id?: string
          max_auto_spend_usd_per_task?: number
          proactive_missions_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      business_daily_metrics: {
        Row: {
          applications_received: number
          campaigns_active: number
          creators_shortlisted: number
          id: string
          messages_sent: number
          metric_date: string
          pipeline_updates: number
          user_id: string
        }
        Insert: {
          applications_received?: number
          campaigns_active?: number
          creators_shortlisted?: number
          id?: string
          messages_sent?: number
          metric_date: string
          pipeline_updates?: number
          user_id: string
        }
        Update: {
          applications_received?: number
          campaigns_active?: number
          creators_shortlisted?: number
          id?: string
          messages_sent?: number
          metric_date?: string
          pipeline_updates?: number
          user_id?: string
        }
        Relationships: []
      }
      business_facts: {
        Row: {
          agent_key: string | null
          business_id: string
          category: string
          confidence: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          fact_key: string
          id: string
          metadata: Json
          mission_id: string | null
          observed_at: string
          source_reference: Json
          source_type: string
          statement: string
          status: string
          structured_value: Json | null
          superseded_by: string | null
          verified_at: string | null
        }
        Insert: {
          agent_key?: string | null
          business_id: string
          category: string
          confidence: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          fact_key: string
          id?: string
          metadata?: Json
          mission_id?: string | null
          observed_at?: string
          source_reference?: Json
          source_type: string
          statement: string
          status?: string
          structured_value?: Json | null
          superseded_by?: string | null
          verified_at?: string | null
        }
        Update: {
          agent_key?: string | null
          business_id?: string
          category?: string
          confidence?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          fact_key?: string
          id?: string
          metadata?: Json
          mission_id?: string | null
          observed_at?: string
          source_reference?: Json
          source_type?: string
          statement?: string
          status?: string
          structured_value?: Json | null
          superseded_by?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_facts_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "business_facts_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "business_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          avg_rating: number | null
          brand_colors: string[]
          campaign_goals: string[]
          company_name: string | null
          company_size: string | null
          created_at: string
          description: string | null
          geographic_market: string | null
          id: string
          industry: string | null
          is_beta_partner: boolean
          is_complete: boolean
          is_verified: boolean
          location: string | null
          logo_original_url: string | null
          logo_url: string | null
          monthly_creator_budget: string | null
          preferred_creator_categories: string[]
          preferred_platforms: string[]
          review_count: number
          target_audience: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          avg_rating?: number | null
          brand_colors?: string[]
          campaign_goals?: string[]
          company_name?: string | null
          company_size?: string | null
          created_at?: string
          description?: string | null
          geographic_market?: string | null
          id?: string
          industry?: string | null
          is_beta_partner?: boolean
          is_complete?: boolean
          is_verified?: boolean
          location?: string | null
          logo_original_url?: string | null
          logo_url?: string | null
          monthly_creator_budget?: string | null
          preferred_creator_categories?: string[]
          preferred_platforms?: string[]
          review_count?: number
          target_audience?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          avg_rating?: number | null
          brand_colors?: string[]
          campaign_goals?: string[]
          company_name?: string | null
          company_size?: string | null
          created_at?: string
          description?: string | null
          geographic_market?: string | null
          id?: string
          industry?: string | null
          is_beta_partner?: boolean
          is_complete?: boolean
          is_verified?: boolean
          location?: string | null
          logo_original_url?: string | null
          logo_url?: string | null
          monthly_creator_budget?: string | null
          preferred_creator_categories?: string[]
          preferred_platforms?: string[]
          review_count?: number
          target_audience?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      business_trust_scores: {
        Row: {
          application_review_speed_hours: number | null
          avg_rating_given: number
          business_profile_id: string | null
          contract_completion: number
          created_at: string
          deliverable_review_speed_hours: number | null
          id: string
          last_computed_at: string
          payment_rate: number
          repeat_creator_rate: number
          score: number
          tier: string
          total_campaigns: number
          total_reviews_given: number
          user_id: string
        }
        Insert: {
          application_review_speed_hours?: number | null
          avg_rating_given?: number
          business_profile_id?: string | null
          contract_completion?: number
          created_at?: string
          deliverable_review_speed_hours?: number | null
          id?: string
          last_computed_at?: string
          payment_rate?: number
          repeat_creator_rate?: number
          score?: number
          tier?: string
          total_campaigns?: number
          total_reviews_given?: number
          user_id: string
        }
        Update: {
          application_review_speed_hours?: number | null
          avg_rating_given?: number
          business_profile_id?: string | null
          contract_completion?: number
          created_at?: string
          deliverable_review_speed_hours?: number | null
          id?: string
          last_computed_at?: string
          payment_rate?: number
          repeat_creator_rate?: number
          score?: number
          tier?: string
          total_campaigns?: number
          total_reviews_given?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_trust_scores_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_intelligence"
            referencedColumns: ["business_profile_id"]
          },
          {
            foreignKeyName: "business_trust_scores_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_applications: {
        Row: {
          campaign_brand: string
          campaign_id: string
          campaign_title: string
          cover_note: string | null
          created_at: string
          creator_profile_id: string
          id: string
          proposed_rate: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_brand?: string
          campaign_id: string
          campaign_title?: string
          cover_note?: string | null
          created_at?: string
          creator_profile_id: string
          id?: string
          proposed_rate?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_brand?: string
          campaign_id?: string
          campaign_title?: string
          cover_note?: string | null
          created_at?: string
          creator_profile_id?: string
          id?: string
          proposed_rate?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_applications_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_discovery_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_applications_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_intelligence"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "campaign_applications_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_assets: {
        Row: {
          asset_type: string
          campaign_id: string
          created_at: string
          display_order: number
          id: string
          name: string | null
          url: string
        }
        Insert: {
          asset_type: string
          campaign_id: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string | null
          url: string
        }
        Update: {
          asset_type?: string
          campaign_id?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_assets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_deliverable_submissions: {
        Row: {
          application_id: string | null
          business_id: string
          campaign_id: string
          created_at: string
          creator_id: string
          creator_notes: string | null
          deadline: string | null
          deliverable_id: string
          feedback: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          reviewed_at: string | null
          revision_count: number
          status: string
          storage_object_path: string | null
          submission_url: string | null
          submitted_at: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          business_id: string
          campaign_id: string
          created_at?: string
          creator_id: string
          creator_notes?: string | null
          deadline?: string | null
          deliverable_id: string
          feedback?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          reviewed_at?: string | null
          revision_count?: number
          status?: string
          storage_object_path?: string | null
          submission_url?: string | null
          submitted_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          business_id?: string
          campaign_id?: string
          created_at?: string
          creator_id?: string
          creator_notes?: string | null
          deadline?: string | null
          deliverable_id?: string
          feedback?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          reviewed_at?: string | null
          revision_count?: number
          status?: string
          storage_object_path?: string | null
          submission_url?: string | null
          submitted_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_deliverable_submissions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "campaign_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_deliverable_submissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_deliverable_submissions_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "campaign_deliverables"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_deliverables: {
        Row: {
          campaign_id: string
          content_type: string
          display_order: number
          id: string
          notes: string | null
          platform: string
          quantity: number
        }
        Insert: {
          campaign_id: string
          content_type: string
          display_order?: number
          id?: string
          notes?: string | null
          platform: string
          quantity?: number
        }
        Update: {
          campaign_id?: string
          content_type?: string
          display_order?: number
          id?: string
          notes?: string | null
          platform?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_deliverables_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_health_scores: {
        Row: {
          application_count: number | null
          applications_score: number | null
          avg_creator_trust: number | null
          campaign_id: string
          completion_score: number | null
          computed_at: string
          creator_quality_score: number | null
          engagement_score: number | null
          id: string
          last_activity_at: string | null
          pioneer_applicants: number | null
          response_speed_score: number | null
          score: number
          user_id: string
          verified_applicants: number | null
        }
        Insert: {
          application_count?: number | null
          applications_score?: number | null
          avg_creator_trust?: number | null
          campaign_id: string
          completion_score?: number | null
          computed_at?: string
          creator_quality_score?: number | null
          engagement_score?: number | null
          id?: string
          last_activity_at?: string | null
          pioneer_applicants?: number | null
          response_speed_score?: number | null
          score?: number
          user_id: string
          verified_applicants?: number | null
        }
        Update: {
          application_count?: number | null
          applications_score?: number | null
          avg_creator_trust?: number | null
          campaign_id?: string
          completion_score?: number | null
          computed_at?: string
          creator_quality_score?: number | null
          engagement_score?: number | null
          id?: string
          last_activity_at?: string | null
          pioneer_applicants?: number | null
          response_speed_score?: number | null
          score?: number
          user_id?: string
          verified_applicants?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_health_scores_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_payments: {
        Row: {
          admin_payout_note: string | null
          approved_at: string | null
          business_id: string
          campaign_id: string
          contract_id: string
          created_at: string
          creator_id: string
          creator_net_cents: number | null
          currency: string
          gross_amount_cents: number
          id: string
          initiated_at: string | null
          notes: string | null
          paid_at: string | null
          payment_url: string | null
          payout_at: string | null
          platform_fee_cents: number
          receipt_url: string | null
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          updated_at: string
        }
        Insert: {
          admin_payout_note?: string | null
          approved_at?: string | null
          business_id: string
          campaign_id: string
          contract_id: string
          created_at?: string
          creator_id: string
          creator_net_cents?: number | null
          currency?: string
          gross_amount_cents: number
          id?: string
          initiated_at?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_url?: string | null
          payout_at?: string | null
          platform_fee_cents?: number
          receipt_url?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_payout_note?: string | null
          approved_at?: string | null
          business_id?: string
          campaign_id?: string
          contract_id?: string
          created_at?: string
          creator_id?: string
          creator_net_cents?: number | null
          currency?: string
          gross_amount_cents?: number
          id?: string
          initiated_at?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_url?: string | null
          payout_at?: string | null
          platform_fee_cents?: number
          receipt_url?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_payments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_saves: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_saves_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          business_industry: string | null
          business_instagram: string | null
          business_location: string | null
          business_name: string
          business_tiktok: string | null
          business_website: string | null
          campaign_goal: string | null
          compensation_amount_fixed: number | null
          compensation_budget_max: number | null
          compensation_budget_min: number | null
          compensation_per_deliverable: number | null
          compensation_type: string
          created_at: string
          deadline: string | null
          description: string
          id: string
          is_beta_campaign: boolean
          is_published: boolean
          min_followers: number | null
          product_service: string | null
          required_country: string | null
          required_language: string | null
          required_niches: string[]
          required_platforms: string[]
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_industry?: string | null
          business_instagram?: string | null
          business_location?: string | null
          business_name: string
          business_tiktok?: string | null
          business_website?: string | null
          campaign_goal?: string | null
          compensation_amount_fixed?: number | null
          compensation_budget_max?: number | null
          compensation_budget_min?: number | null
          compensation_per_deliverable?: number | null
          compensation_type: string
          created_at?: string
          deadline?: string | null
          description: string
          id?: string
          is_beta_campaign?: boolean
          is_published?: boolean
          min_followers?: number | null
          product_service?: string | null
          required_country?: string | null
          required_language?: string | null
          required_niches?: string[]
          required_platforms?: string[]
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_industry?: string | null
          business_instagram?: string | null
          business_location?: string | null
          business_name?: string
          business_tiktok?: string | null
          business_website?: string | null
          campaign_goal?: string | null
          compensation_amount_fixed?: number | null
          compensation_budget_max?: number | null
          compensation_budget_min?: number | null
          compensation_per_deliverable?: number | null
          compensation_type?: string
          created_at?: string
          deadline?: string | null
          description?: string
          id?: string
          is_beta_campaign?: boolean
          is_published?: boolean
          min_followers?: number | null
          product_service?: string | null
          required_country?: string | null
          required_language?: string | null
          required_niches?: string[]
          required_platforms?: string[]
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chats: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_accounts: {
        Row: {
          access_token_placeholder: string | null
          connection_status: Database["public"]["Enums"]["connection_status"]
          created_at: string
          id: string
          platform: Database["public"]["Enums"]["platform"]
          platform_account_id: string | null
          refresh_token_placeholder: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          access_token_placeholder?: string | null
          connection_status?: Database["public"]["Enums"]["connection_status"]
          created_at?: string
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          platform_account_id?: string | null
          refresh_token_placeholder?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          access_token_placeholder?: string | null
          connection_status?: Database["public"]["Enums"]["connection_status"]
          created_at?: string
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          platform_account_id?: string | null
          refresh_token_placeholder?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      content_calendar: {
        Row: {
          caption: string | null
          created_at: string
          cta: string | null
          hook: string | null
          id: string
          platform: Database["public"]["Enums"]["platform"]
          scheduled_date: string | null
          status: Database["public"]["Enums"]["calendar_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          cta?: string | null
          hook?: string | null
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["calendar_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          cta?: string | null
          hook?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["calendar_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_plan_sessions: {
        Row: {
          created_at: string
          frequency: number
          goal: string
          id: string
          item_count: number
          model: string | null
          platforms: string[]
          title: string
          user_id: string
          weeks: number
        }
        Insert: {
          created_at?: string
          frequency?: number
          goal?: string
          id?: string
          item_count?: number
          model?: string | null
          platforms?: string[]
          title?: string
          user_id: string
          weeks?: number
        }
        Update: {
          created_at?: string
          frequency?: number
          goal?: string
          id?: string
          item_count?: number
          model?: string | null
          platforms?: string[]
          title?: string
          user_id?: string
          weeks?: number
        }
        Relationships: []
      }
      content_planner_items: {
        Row: {
          ai_generated: boolean | null
          caption: string | null
          content_idea: string | null
          content_type: string
          created_at: string | null
          creative_direction: string | null
          cta: string | null
          hook: string | null
          id: string
          notes: string | null
          platform: string
          post_goal: string | null
          scheduled_date: string
          scheduled_time: string | null
          session_id: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string
          why_it_works: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          caption?: string | null
          content_idea?: string | null
          content_type: string
          created_at?: string | null
          creative_direction?: string | null
          cta?: string | null
          hook?: string | null
          id?: string
          notes?: string | null
          platform: string
          post_goal?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          session_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
          why_it_works?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          caption?: string | null
          content_idea?: string | null
          content_type?: string
          created_at?: string | null
          creative_direction?: string | null
          cta?: string | null
          hook?: string | null
          id?: string
          notes?: string | null
          platform?: string
          post_goal?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          session_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          why_it_works?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_content_plan_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "content_plan_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          accepted_at: string | null
          amount_cents: number | null
          business_id: string
          business_name: string | null
          campaign_id: string
          campaign_title: string
          cancellation_terms: string | null
          contract_snapshot: Json | null
          contract_version: number | null
          created_at: string
          creator_id: string
          creator_name: string | null
          currency: string | null
          decline_note: string | null
          decline_reason: string | null
          declined_at: string | null
          deliverables_json: Json | null
          due_date: string | null
          id: string
          ownership_clause: string | null
          payment_status: string | null
          platform_fee_pct: number | null
          sent_at: string | null
          signed_at: string | null
          signed_ip: string | null
          signed_user_agent: string | null
          signer_email: string | null
          signer_ip: string | null
          signer_user_agent: string | null
          signer_user_id: string | null
          status: string
          terms: string
          title: string
          updated_at: string
          usage_rights: string | null
        }
        Insert: {
          accepted_at?: string | null
          amount_cents?: number | null
          business_id: string
          business_name?: string | null
          campaign_id: string
          campaign_title: string
          cancellation_terms?: string | null
          contract_snapshot?: Json | null
          contract_version?: number | null
          created_at?: string
          creator_id: string
          creator_name?: string | null
          currency?: string | null
          decline_note?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          deliverables_json?: Json | null
          due_date?: string | null
          id?: string
          ownership_clause?: string | null
          payment_status?: string | null
          platform_fee_pct?: number | null
          sent_at?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          signer_email?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          signer_user_id?: string | null
          status?: string
          terms: string
          title: string
          updated_at?: string
          usage_rights?: string | null
        }
        Update: {
          accepted_at?: string | null
          amount_cents?: number | null
          business_id?: string
          business_name?: string | null
          campaign_id?: string
          campaign_title?: string
          cancellation_terms?: string | null
          contract_snapshot?: Json | null
          contract_version?: number | null
          created_at?: string
          creator_id?: string
          creator_name?: string | null
          currency?: string | null
          decline_note?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          deliverables_json?: Json | null
          due_date?: string | null
          id?: string
          ownership_clause?: string | null
          payment_status?: string | null
          platform_fee_pct?: number | null
          sent_at?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          signer_email?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          signer_user_id?: string | null
          status?: string
          terms?: string
          title?: string
          updated_at?: string
          usage_rights?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          unread_count: number
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          unread_count?: number
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          unread_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string | null
          last_sender_id: string | null
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          last_sender_id?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          last_sender_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_analytics_events: {
        Row: {
          created_at: string
          creator_profile_id: string
          event_type: string
          id: string
          meta: Json | null
        }
        Insert: {
          created_at?: string
          creator_profile_id: string
          event_type: string
          id?: string
          meta?: Json | null
        }
        Update: {
          created_at?: string
          creator_profile_id?: string
          event_type?: string
          id?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_analytics_events_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_discovery_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_analytics_events_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_intelligence"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "creator_analytics_events_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_availability: {
        Row: {
          available_until: string | null
          creator_profile_id: string
          current_city: string | null
          current_country: string | null
          current_lat: number | null
          current_lng: number | null
          id: string
          status: string
          travel_date: string | null
          traveling_to_city: string | null
          traveling_to_country: string | null
          traveling_to_lat: number | null
          traveling_to_lng: number | null
          updated_at: string
        }
        Insert: {
          available_until?: string | null
          creator_profile_id: string
          current_city?: string | null
          current_country?: string | null
          current_lat?: number | null
          current_lng?: number | null
          id?: string
          status?: string
          travel_date?: string | null
          traveling_to_city?: string | null
          traveling_to_country?: string | null
          traveling_to_lat?: number | null
          traveling_to_lng?: number | null
          updated_at?: string
        }
        Update: {
          available_until?: string | null
          creator_profile_id?: string
          current_city?: string | null
          current_country?: string | null
          current_lat?: number | null
          current_lng?: number | null
          id?: string
          status?: string
          travel_date?: string | null
          traveling_to_city?: string | null
          traveling_to_country?: string | null
          traveling_to_lat?: number | null
          traveling_to_lng?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_availability_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: true
            referencedRelation: "creator_discovery_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_availability_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: true
            referencedRelation: "creator_intelligence"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "creator_availability_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: true
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_daily_metrics: {
        Row: {
          applications_sent: number
          id: string
          match_appearances: number
          messages_received: number
          metric_date: string
          profile_views: number
          saves_received: number
          user_id: string
          visibility_score: number
        }
        Insert: {
          applications_sent?: number
          id?: string
          match_appearances?: number
          messages_received?: number
          metric_date: string
          profile_views?: number
          saves_received?: number
          user_id: string
          visibility_score?: number
        }
        Update: {
          applications_sent?: number
          id?: string
          match_appearances?: number
          messages_received?: number
          metric_date?: string
          profile_views?: number
          saves_received?: number
          user_id?: string
          visibility_score?: number
        }
        Relationships: []
      }
      creator_oauth_tokens: {
        Row: {
          access_token_secret_id: string
          created_at: string
          expires_at: string | null
          id: string
          ig_user_id: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_secret_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ig_user_id?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_secret_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ig_user_id?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_profiles: {
        Row: {
          accepts_affiliate: boolean
          accepts_gifted: boolean
          accepts_paid: boolean
          audience_age_range: string | null
          audience_gender_split: string | null
          audience_location: string | null
          avatar_original_url: string | null
          avg_rating: number | null
          bio: string | null
          brand_colors: string[]
          categories: string[]
          created_at: string
          creator_stage: string
          creator_verification_type: string
          display_name: string
          featured_link_1: string | null
          featured_link_2: string | null
          featured_link_3: string | null
          follower_count: number | null
          id: string
          instagram_connected: boolean
          instagram_followers: number | null
          instagram_followers_synced_at: string | null
          instagram_handle: string | null
          instagram_profile_picture_url: string | null
          instagram_user_id: string | null
          is_beta_pioneer: boolean
          is_public: boolean
          is_verified: boolean
          location: string | null
          location_area: string | null
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          media_kit_url: string | null
          niche: string | null
          platforms: string[]
          preferred_content_types: string[]
          previous_collaborations: string | null
          primary_language: string | null
          profile_image_url: string | null
          rate_range: string | null
          review_count: number
          search_vector: unknown
          status: string
          tiktok_handle: string | null
          updated_at: string
          user_id: string
          username: string | null
          verification_status: string
          youtube_handle: string | null
        }
        Insert: {
          accepts_affiliate?: boolean
          accepts_gifted?: boolean
          accepts_paid?: boolean
          audience_age_range?: string | null
          audience_gender_split?: string | null
          audience_location?: string | null
          avatar_original_url?: string | null
          avg_rating?: number | null
          bio?: string | null
          brand_colors?: string[]
          categories?: string[]
          created_at?: string
          creator_stage?: string
          creator_verification_type?: string
          display_name: string
          featured_link_1?: string | null
          featured_link_2?: string | null
          featured_link_3?: string | null
          follower_count?: number | null
          id?: string
          instagram_connected?: boolean
          instagram_followers?: number | null
          instagram_followers_synced_at?: string | null
          instagram_handle?: string | null
          instagram_profile_picture_url?: string | null
          instagram_user_id?: string | null
          is_beta_pioneer?: boolean
          is_public?: boolean
          is_verified?: boolean
          location?: string | null
          location_area?: string | null
          location_city?: string | null
          location_country?: string | null
          location_lat?: number | null
          location_lng?: number | null
          media_kit_url?: string | null
          niche?: string | null
          platforms?: string[]
          preferred_content_types?: string[]
          previous_collaborations?: string | null
          primary_language?: string | null
          profile_image_url?: string | null
          rate_range?: string | null
          review_count?: number
          search_vector?: unknown
          status?: string
          tiktok_handle?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          verification_status?: string
          youtube_handle?: string | null
        }
        Update: {
          accepts_affiliate?: boolean
          accepts_gifted?: boolean
          accepts_paid?: boolean
          audience_age_range?: string | null
          audience_gender_split?: string | null
          audience_location?: string | null
          avatar_original_url?: string | null
          avg_rating?: number | null
          bio?: string | null
          brand_colors?: string[]
          categories?: string[]
          created_at?: string
          creator_stage?: string
          creator_verification_type?: string
          display_name?: string
          featured_link_1?: string | null
          featured_link_2?: string | null
          featured_link_3?: string | null
          follower_count?: number | null
          id?: string
          instagram_connected?: boolean
          instagram_followers?: number | null
          instagram_followers_synced_at?: string | null
          instagram_handle?: string | null
          instagram_profile_picture_url?: string | null
          instagram_user_id?: string | null
          is_beta_pioneer?: boolean
          is_public?: boolean
          is_verified?: boolean
          location?: string | null
          location_area?: string | null
          location_city?: string | null
          location_country?: string | null
          location_lat?: number | null
          location_lng?: number | null
          media_kit_url?: string | null
          niche?: string | null
          platforms?: string[]
          preferred_content_types?: string[]
          previous_collaborations?: string | null
          primary_language?: string | null
          profile_image_url?: string | null
          rate_range?: string | null
          review_count?: number
          search_vector?: unknown
          status?: string
          tiktok_handle?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          verification_status?: string
          youtube_handle?: string | null
        }
        Relationships: []
      }
      creator_travel_plans: {
        Row: {
          created_at: string | null
          creator_profile_id: string
          destination_city: string
          destination_country: string
          destination_lat: number | null
          destination_lng: number | null
          end_date: string
          id: string
          notes: string | null
          start_date: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string | null
          creator_profile_id: string
          destination_city: string
          destination_country: string
          destination_lat?: number | null
          destination_lng?: number | null
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string | null
          creator_profile_id?: string
          destination_city?: string
          destination_country?: string
          destination_lat?: number | null
          destination_lng?: number | null
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_travel_plans_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_discovery_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_travel_plans_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_intelligence"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "creator_travel_plans_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_trust_scores: {
        Row: {
          accepted_contract_rate: number | null
          approval_rate: number
          avg_rating: number
          avg_response_time_hours: number | null
          completion_rate: number
          created_at: string
          creator_profile_id: string | null
          id: string
          last_computed_at: string
          repeat_rate: number
          revision_rate: number | null
          score: number
          tier: string
          total_campaigns: number
          total_cancelled_campaigns: number | null
          total_reviews: number
          user_id: string
        }
        Insert: {
          accepted_contract_rate?: number | null
          approval_rate?: number
          avg_rating?: number
          avg_response_time_hours?: number | null
          completion_rate?: number
          created_at?: string
          creator_profile_id?: string | null
          id?: string
          last_computed_at?: string
          repeat_rate?: number
          revision_rate?: number | null
          score?: number
          tier?: string
          total_campaigns?: number
          total_cancelled_campaigns?: number | null
          total_reviews?: number
          user_id: string
        }
        Update: {
          accepted_contract_rate?: number | null
          approval_rate?: number
          avg_rating?: number
          avg_response_time_hours?: number | null
          completion_rate?: number
          created_at?: string
          creator_profile_id?: string | null
          id?: string
          last_computed_at?: string
          repeat_rate?: number
          revision_rate?: number | null
          score?: number
          tier?: string
          total_campaigns?: number
          total_cancelled_campaigns?: number | null
          total_reviews?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_trust_scores_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_discovery_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_trust_scores_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_intelligence"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "creator_trust_scores_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_visibility_scores: {
        Row: {
          activity_score: number
          id: string
          instagram_verified: boolean
          last_calculated_at: string
          previous_score: number
          profile_completeness: number
          recent_appearances: number
          recent_saves: number
          recent_views: number
          response_score: number
          score: number
          user_id: string
          weekly_change: number
        }
        Insert: {
          activity_score?: number
          id?: string
          instagram_verified?: boolean
          last_calculated_at?: string
          previous_score?: number
          profile_completeness?: number
          recent_appearances?: number
          recent_saves?: number
          recent_views?: number
          response_score?: number
          score?: number
          user_id: string
          weekly_change?: number
        }
        Update: {
          activity_score?: number
          id?: string
          instagram_verified?: boolean
          last_calculated_at?: string
          previous_score?: number
          profile_completeness?: number
          recent_appearances?: number
          recent_saves?: number
          recent_views?: number
          response_score?: number
          score?: number
          user_id?: string
          weekly_change?: number
        }
        Relationships: []
      }
      deliverable_revisions: {
        Row: {
          attachments: Json | null
          created_at: string
          feedback: string
          id: string
          requester_id: string
          submission_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          feedback: string
          id?: string
          requester_id: string
          submission_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          feedback?: string
          id?: string
          requester_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_revisions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "campaign_deliverable_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_reports: {
        Row: {
          business_id: string
          confidence: number
          created_at: string
          data_snapshot: Json
          generated_at: string
          generation_cost_usd: number | null
          id: string
          model: string | null
          narrative: Json
          overall_health_score: number | null
          period_end: string
          period_start: string
          priority_recommendation: string
          provider: string | null
          report_type: string
          report_version: number
          schema_version: number
          top_opportunity: string | null
          top_risk: string | null
        }
        Insert: {
          business_id: string
          confidence: number
          created_at?: string
          data_snapshot: Json
          generated_at?: string
          generation_cost_usd?: number | null
          id?: string
          model?: string | null
          narrative: Json
          overall_health_score?: number | null
          period_end: string
          period_start: string
          priority_recommendation: string
          provider?: string | null
          report_type: string
          report_version?: number
          schema_version?: number
          top_opportunity?: string | null
          top_risk?: string | null
        }
        Update: {
          business_id?: string
          confidence?: number
          created_at?: string
          data_snapshot?: Json
          generated_at?: string
          generation_cost_usd?: number | null
          id?: string
          model?: string | null
          narrative?: Json
          overall_health_score?: number | null
          period_end?: string
          period_start?: string
          priority_recommendation?: string
          provider?: string | null
          report_type?: string
          report_version?: number
          schema_version?: number
          top_opportunity?: string | null
          top_risk?: string | null
        }
        Relationships: []
      }
      generated_assets: {
        Row: {
          aspect_ratio: string | null
          asset_type: string
          content_planner_item_id: string | null
          created_at: string
          credits_used: number
          error_message: string | null
          higgsfield_request_id: string | null
          id: string
          output_url: string | null
          prompt: string
          provider: string
          refunded: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          asset_type: string
          content_planner_item_id?: string | null
          created_at?: string
          credits_used?: number
          error_message?: string | null
          higgsfield_request_id?: string | null
          id?: string
          output_url?: string | null
          prompt: string
          provider?: string
          refunded?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          asset_type?: string
          content_planner_item_id?: string | null
          created_at?: string
          credits_used?: number
          error_message?: string | null
          higgsfield_request_id?: string | null
          id?: string
          output_url?: string | null
          prompt?: string
          provider?: string
          refunded?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_assets_content_planner_item_id_fkey"
            columns: ["content_planner_item_id"]
            isOneToOne: false
            referencedRelation: "content_planner_items"
            referencedColumns: ["id"]
          },
        ]
      }
      higgsfield_credit_usage: {
        Row: {
          credits_used: number
          month_start: string
          user_id: string
        }
        Insert: {
          credits_used?: number
          month_start: string
          user_id: string
        }
        Update: {
          credits_used?: number
          month_start?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          budget: string | null
          company: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          source: string | null
        }
        Insert: {
          budget?: string | null
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          source?: string | null
        }
        Update: {
          budget?: string | null
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          source?: string | null
        }
        Relationships: []
      }
      market_competitors: {
        Row: {
          aliases: string[]
          business_id: string
          confidence: number | null
          created_at: string
          domain: string | null
          first_seen_finding_id: string | null
          id: string
          name: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          business_id: string
          confidence?: number | null
          created_at?: string
          domain?: string | null
          first_seen_finding_id?: string | null
          id?: string
          name: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          business_id?: string
          confidence?: number | null
          created_at?: string
          domain?: string | null
          first_seen_finding_id?: string | null
          id?: string
          name?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_competitors_first_seen_finding_fk"
            columns: ["first_seen_finding_id"]
            isOneToOne: false
            referencedRelation: "market_intelligence_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intelligence_briefs: {
        Row: {
          brief: Json
          business_id: string
          generated_at: string
          id: string
          model: string | null
          period_start: string
          provider: string | null
        }
        Insert: {
          brief?: Json
          business_id: string
          generated_at?: string
          id?: string
          model?: string | null
          period_start: string
          provider?: string | null
        }
        Update: {
          brief?: Json
          business_id?: string
          generated_at?: string
          id?: string
          model?: string | null
          period_start?: string
          provider?: string | null
        }
        Relationships: []
      }
      market_intelligence_finding_sources: {
        Row: {
          business_id: string
          cited_text: string | null
          created_at: string
          fetched_at: string
          finding_id: string
          id: string
          source_domain: string
          source_published_at: string | null
          source_title: string | null
          source_url: string
        }
        Insert: {
          business_id: string
          cited_text?: string | null
          created_at?: string
          fetched_at?: string
          finding_id: string
          id?: string
          source_domain: string
          source_published_at?: string | null
          source_title?: string | null
          source_url: string
        }
        Update: {
          business_id?: string
          cited_text?: string | null
          created_at?: string
          fetched_at?: string
          finding_id?: string
          id?: string
          source_domain?: string
          source_published_at?: string | null
          source_title?: string | null
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_intelligence_finding_sources_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "market_intelligence_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intelligence_findings: {
        Row: {
          business_id: string
          category: string
          competitor_id: string | null
          confidence: number
          created_at: string
          dedupe_key: string
          evidence: string
          fetched_at: string
          id: string
          market_topic: string | null
          raw_metadata: Json
          relevance: number
          search_family: string
          search_query: string
          source_domain: string
          source_published_at: string | null
          source_title: string | null
          source_url: string
          stale_after: string
          status: string
          summary: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          category: string
          competitor_id?: string | null
          confidence: number
          created_at?: string
          dedupe_key: string
          evidence: string
          fetched_at?: string
          id?: string
          market_topic?: string | null
          raw_metadata?: Json
          relevance: number
          search_family: string
          search_query: string
          source_domain: string
          source_published_at?: string | null
          source_title?: string | null
          source_url: string
          stale_after: string
          status?: string
          summary: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string
          competitor_id?: string | null
          confidence?: number
          created_at?: string
          dedupe_key?: string
          evidence?: string
          fetched_at?: string
          id?: string
          market_topic?: string | null
          raw_metadata?: Json
          relevance?: number
          search_family?: string
          search_query?: string
          source_domain?: string
          source_published_at?: string | null
          source_title?: string | null
          source_url?: string
          stale_after?: string
          status?: string
          summary?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_intelligence_findings_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "market_competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intelligence_paused_businesses: {
        Row: {
          business_id: string
          paused_at: string
          reason: string | null
        }
        Insert: {
          business_id: string
          paused_at?: string
          reason?: string | null
        }
        Update: {
          business_id?: string
          paused_at?: string
          reason?: string | null
        }
        Relationships: []
      }
      market_intelligence_search_cursor: {
        Row: {
          business_id: string
          consecutive_empty_runs: number
          consecutive_failures: number
          created_at: string
          id: string
          last_error_class: string | null
          last_run_at: string | null
          last_run_search_count: number
          last_run_status: string | null
          leased_by: string | null
          leased_until: string | null
          next_eligible_at: string
          search_family: string
          updated_at: string
        }
        Insert: {
          business_id: string
          consecutive_empty_runs?: number
          consecutive_failures?: number
          created_at?: string
          id?: string
          last_error_class?: string | null
          last_run_at?: string | null
          last_run_search_count?: number
          last_run_status?: string | null
          leased_by?: string | null
          leased_until?: string | null
          next_eligible_at?: string
          search_family: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          consecutive_empty_runs?: number
          consecutive_failures?: number
          created_at?: string
          id?: string
          last_error_class?: string | null
          last_run_at?: string | null
          last_run_search_count?: number
          last_run_status?: string | null
          leased_by?: string | null
          leased_until?: string | null
          next_eligible_at?: string
          search_family?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_health_snapshots: {
        Row: {
          business_id: string
          generated_at: string
          id: string
          model: string | null
          period_start: string
          provider: string | null
          snapshot: Json
        }
        Insert: {
          business_id: string
          generated_at?: string
          id?: string
          model?: string | null
          period_start: string
          provider?: string | null
          snapshot?: Json
        }
        Update: {
          business_id?: string
          generated_at?: string
          id?: string
          model?: string | null
          period_start?: string
          provider?: string | null
          snapshot?: Json
        }
        Relationships: []
      }
      marketing_hub_briefings: {
        Row: {
          briefing: Json
          generated_at: string
          id: string
          model: string | null
          period_start: string
          provider: string | null
          schema_version: number
          user_id: string
        }
        Insert: {
          briefing?: Json
          generated_at?: string
          id?: string
          model?: string | null
          period_start: string
          provider?: string | null
          schema_version?: number
          user_id: string
        }
        Update: {
          briefing?: Json
          generated_at?: string
          id?: string
          model?: string | null
          period_start?: string
          provider?: string | null
          schema_version?: number
          user_id?: string
        }
        Relationships: []
      }
      marketplace_events: {
        Row: {
          actor_user_id: string | null
          application_id: string | null
          business_id: string | null
          campaign_id: string | null
          contract_id: string | null
          created_at: string
          creator_id: string | null
          deliverable_id: string | null
          event_type: string
          id: string
          metadata_json: Json | null
        }
        Insert: {
          actor_user_id?: string | null
          application_id?: string | null
          business_id?: string | null
          campaign_id?: string | null
          contract_id?: string | null
          created_at?: string
          creator_id?: string | null
          deliverable_id?: string | null
          event_type: string
          id?: string
          metadata_json?: Json | null
        }
        Update: {
          actor_user_id?: string | null
          application_id?: string | null
          business_id?: string | null
          campaign_id?: string | null
          contract_id?: string | null
          created_at?: string
          creator_id?: string | null
          deliverable_id?: string | null
          event_type?: string
          id?: string
          metadata_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "campaign_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_events_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "campaign_deliverable_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      match_outcomes: {
        Row: {
          accepted_at: string | null
          business_user_id: string
          campaign_id: string
          completed_at: string | null
          contract_accepted: boolean
          contract_accepted_at: string | null
          contract_sent: boolean
          created_at: string
          creator_profile_id: string
          creator_trust_at_time: number | null
          deliverables_approved: boolean
          id: string
          match_score: number | null
          payment_completed: boolean
          score_breakdown: Json | null
          shortlisted_at: string | null
          updated_at: string
          was_accepted: boolean
          was_rehired: boolean
          was_shortlisted: boolean
        }
        Insert: {
          accepted_at?: string | null
          business_user_id: string
          campaign_id: string
          completed_at?: string | null
          contract_accepted?: boolean
          contract_accepted_at?: string | null
          contract_sent?: boolean
          created_at?: string
          creator_profile_id: string
          creator_trust_at_time?: number | null
          deliverables_approved?: boolean
          id?: string
          match_score?: number | null
          payment_completed?: boolean
          score_breakdown?: Json | null
          shortlisted_at?: string | null
          updated_at?: string
          was_accepted?: boolean
          was_rehired?: boolean
          was_shortlisted?: boolean
        }
        Update: {
          accepted_at?: string | null
          business_user_id?: string
          campaign_id?: string
          completed_at?: string | null
          contract_accepted?: boolean
          contract_accepted_at?: string | null
          contract_sent?: boolean
          created_at?: string
          creator_profile_id?: string
          creator_trust_at_time?: number | null
          deliverables_approved?: boolean
          id?: string
          match_score?: number | null
          payment_completed?: boolean
          score_breakdown?: Json | null
          shortlisted_at?: string | null
          updated_at?: string
          was_accepted?: boolean
          was_rehired?: boolean
          was_shortlisted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "match_outcomes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_outcomes_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_discovery_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_outcomes_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_intelligence"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "match_outcomes_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_score_cache: {
        Row: {
          business_id: string | null
          campaign_id: string
          computed_at: string
          creator_id: string
          expires_at: string
          explanation_json: Json
          id: string
          score: number
          success_probability: number
        }
        Insert: {
          business_id?: string | null
          campaign_id: string
          computed_at?: string
          creator_id: string
          expires_at?: string
          explanation_json?: Json
          id?: string
          score?: number
          success_probability?: number
        }
        Update: {
          business_id?: string | null
          campaign_id?: string
          computed_at?: string
          creator_id?: string
          expires_at?: string
          explanation_json?: Json
          id?: string
          score?: number
          success_probability?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_score_cache_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      match_scores: {
        Row: {
          audience_score: number
          campaign_id: string
          creator_id: string
          id: string
          location_score: number
          niche_score: number
          platform_score: number
          requirements_score: number
          total_score: number
          updated_at: string
        }
        Insert: {
          audience_score: number
          campaign_id: string
          creator_id: string
          id?: string
          location_score: number
          niche_score: number
          platform_score: number
          requirements_score: number
          total_score: number
          updated_at?: string
        }
        Update: {
          audience_score?: number
          campaign_id?: string
          creator_id?: string
          id?: string
          location_score?: number
          niche_score?: number
          platform_score?: number
          requirements_score?: number
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_scores_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_scores_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_discovery_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_scores_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_intelligence"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "match_scores_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_kit_views: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          referrer: string | null
          viewer_ip: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          referrer?: string | null
          viewer_ip?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          referrer?: string | null
          viewer_ip?: string | null
        }
        Relationships: []
      }
      memory_candidates: {
        Row: {
          agent_key: string | null
          business_id: string
          category: string
          created_at: string
          evidence: Json
          fact_key: string
          id: string
          mission_id: string | null
          promoted_fact_id: string | null
          proposed_confidence: string
          proposed_source_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          statement: string
          status: string
          structured_value: Json | null
        }
        Insert: {
          agent_key?: string | null
          business_id: string
          category: string
          created_at?: string
          evidence?: Json
          fact_key: string
          id?: string
          mission_id?: string | null
          promoted_fact_id?: string | null
          proposed_confidence: string
          proposed_source_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          statement: string
          status?: string
          structured_value?: Json | null
        }
        Update: {
          agent_key?: string | null
          business_id?: string
          category?: string
          created_at?: string
          evidence?: Json
          fact_key?: string
          id?: string
          mission_id?: string | null
          promoted_fact_id?: string | null
          proposed_confidence?: string
          proposed_source_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          statement?: string
          status?: string
          structured_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_candidates_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "memory_candidates_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_candidates_promoted_fact_id_fkey"
            columns: ["promoted_fact_id"]
            isOneToOne: false
            referencedRelation: "business_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          client_temp_id: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          client_temp_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          client_temp_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_approvals: {
        Row: {
          action_type: string
          business_id: string
          decided_at: string | null
          decided_by: string | null
          execution_result: Json | null
          financial_impact_usd: number | null
          id: string
          mission_id: string
          preview: Json
          requested_at: string
          risk_level: string
          status: string
          task_id: string
        }
        Insert: {
          action_type: string
          business_id: string
          decided_at?: string | null
          decided_by?: string | null
          execution_result?: Json | null
          financial_impact_usd?: number | null
          id?: string
          mission_id: string
          preview?: Json
          requested_at?: string
          risk_level: string
          status?: string
          task_id: string
        }
        Update: {
          action_type?: string
          business_id?: string
          decided_at?: string | null
          decided_by?: string | null
          execution_result?: Json | null
          financial_impact_usd?: number | null
          id?: string
          mission_id?: string
          preview?: Json
          requested_at?: string
          risk_level?: string
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_approvals_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_approvals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "mission_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_completions: {
        Row: {
          completed_at: string
          id: string
          mission_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          mission_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          mission_id?: string
          user_id?: string
        }
        Relationships: []
      }
      mission_events: {
        Row: {
          actor: string
          business_id: string
          created_at: string
          event_type: string
          id: string
          message: string
          mission_id: string
          payload: Json | null
          task_id: string | null
        }
        Insert: {
          actor: string
          business_id: string
          created_at?: string
          event_type: string
          id?: string
          message: string
          mission_id: string
          payload?: Json | null
          task_id?: string | null
        }
        Update: {
          actor?: string
          business_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          mission_id?: string
          payload?: Json | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "mission_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_tasks: {
        Row: {
          actual_cost_usd: number | null
          agent_key: string
          business_id: string
          completed_at: string | null
          created_at: string
          depends_on: string[]
          error_message: string | null
          estimated_cost_usd: number | null
          id: string
          input_data: Json
          leased_by: string | null
          leased_until: string | null
          max_retries: number
          mission_id: string
          next_attempt_at: string
          order_index: number
          output_data: Json | null
          requires_approval: boolean
          retry_count: number
          risk_level: string
          started_at: string | null
          status: string
          title: string
          tool_name: string
          updated_at: string
        }
        Insert: {
          actual_cost_usd?: number | null
          agent_key: string
          business_id: string
          completed_at?: string | null
          created_at?: string
          depends_on?: string[]
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_data?: Json
          leased_by?: string | null
          leased_until?: string | null
          max_retries?: number
          mission_id: string
          next_attempt_at?: string
          order_index?: number
          output_data?: Json | null
          requires_approval?: boolean
          retry_count?: number
          risk_level: string
          started_at?: string | null
          status?: string
          title: string
          tool_name: string
          updated_at?: string
        }
        Update: {
          actual_cost_usd?: number | null
          agent_key?: string
          business_id?: string
          completed_at?: string | null
          created_at?: string
          depends_on?: string[]
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_data?: Json
          leased_by?: string | null
          leased_until?: string | null
          max_retries?: number
          mission_id?: string
          next_attempt_at?: string
          order_index?: number
          output_data?: Json | null
          requires_approval?: boolean
          retry_count?: number
          risk_level?: string
          started_at?: string | null
          status?: string
          title?: string
          tool_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_tasks_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "mission_tasks_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          business_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          learnings_processed_at: string | null
          objective: string
          objective_summary: string | null
          plan_schema_version: number
          priority: string
          status: string
          strategy_summary: string | null
          target_metrics: Json
          updated_at: string
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          learnings_processed_at?: string | null
          objective: string
          objective_summary?: string | null
          plan_schema_version?: number
          priority?: string
          status?: string
          strategy_summary?: string | null
          target_metrics?: Json
          updated_at?: string
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          learnings_processed_at?: string | null
          objective?: string
          objective_summary?: string | null
          plan_schema_version?: number
          priority?: string
          status?: string
          strategy_summary?: string | null
          target_metrics?: Json
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          campaign_updates: boolean
          contracts: boolean
          created_at: string
          deliverables: boolean
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          marketing_updates: boolean
          messages: boolean
          push_enabled: boolean
          updated_at: string
          user_id: string
          weekly_reports: boolean
          whatsapp_enabled: boolean
        }
        Insert: {
          campaign_updates?: boolean
          contracts?: boolean
          created_at?: string
          deliverables?: boolean
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          marketing_updates?: boolean
          messages?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id: string
          weekly_reports?: boolean
          whatsapp_enabled?: boolean
        }
        Update: {
          campaign_updates?: boolean
          contracts?: boolean
          created_at?: string
          deliverables?: boolean
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          marketing_updates?: boolean
          messages?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
          weekly_reports?: boolean
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunity_saves: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_saves_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_spend_ceiling: {
        Row: {
          daily_cap_usd: number
          daily_consumed_usd: number
          day_reset_at: string
          id: boolean
          month_reset_at: string
          monthly_cap_usd: number
          monthly_consumed_usd: number
          updated_at: string
        }
        Insert: {
          daily_cap_usd?: number
          daily_consumed_usd?: number
          day_reset_at?: string
          id?: boolean
          month_reset_at?: string
          monthly_cap_usd?: number
          monthly_consumed_usd?: number
          updated_at?: string
        }
        Update: {
          daily_cap_usd?: number
          daily_consumed_usd?: number
          day_reset_at?: string
          id?: boolean
          month_reset_at?: string
          monthly_cap_usd?: number
          monthly_consumed_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          ai_analysis: string | null
          caption: string | null
          comments: number | null
          created_at: string
          cta: string | null
          engagement_rate: number | null
          hook: string | null
          id: string
          likes: number | null
          platform: Database["public"]["Enums"]["platform"]
          posted_at: string | null
          reach: number | null
          saves: number | null
          shares: number | null
          suggested_improvement: string | null
          thumbnail_url: string | null
          user_id: string
          views: number | null
        }
        Insert: {
          ai_analysis?: string | null
          caption?: string | null
          comments?: number | null
          created_at?: string
          cta?: string | null
          engagement_rate?: number | null
          hook?: string | null
          id?: string
          likes?: number | null
          platform: Database["public"]["Enums"]["platform"]
          posted_at?: string | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          suggested_improvement?: string | null
          thumbnail_url?: string | null
          user_id: string
          views?: number | null
        }
        Update: {
          ai_analysis?: string | null
          caption?: string | null
          comments?: number | null
          created_at?: string
          cta?: string | null
          engagement_rate?: number | null
          hook?: string | null
          id?: string
          likes?: number | null
          platform?: Database["public"]["Enums"]["platform"]
          posted_at?: string | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          suggested_improvement?: string | null
          thumbnail_url?: string | null
          user_id?: string
          views?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          biggest_problem: string | null
          business_stage: string | null
          created_at: string
          email: string | null
          goal: string | null
          id: string
          is_beta_pioneer: boolean
          name: string | null
          niche: string | null
          onboarding_completed: boolean
          onboarding_path: string | null
          phone_number: string | null
          pioneer_granted_at: string | null
          pioneer_granted_by: string | null
          platforms: string[] | null
          post_frequency: string | null
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          biggest_problem?: string | null
          business_stage?: string | null
          created_at?: string
          email?: string | null
          goal?: string | null
          id: string
          is_beta_pioneer?: boolean
          name?: string | null
          niche?: string | null
          onboarding_completed?: boolean
          onboarding_path?: string | null
          phone_number?: string | null
          pioneer_granted_at?: string | null
          pioneer_granted_by?: string | null
          platforms?: string[] | null
          post_frequency?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          biggest_problem?: string | null
          business_stage?: string | null
          created_at?: string
          email?: string | null
          goal?: string | null
          id?: string
          is_beta_pioneer?: boolean
          name?: string | null
          niche?: string | null
          onboarding_completed?: boolean
          onboarding_path?: string | null
          phone_number?: string | null
          pioneer_granted_at?: string | null
          pioneer_granted_by?: string | null
          platforms?: string[] | null
          post_frequency?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      project_campaign_briefs: {
        Row: {
          additional_notes: string | null
          audience_location: string | null
          brand_notes: string | null
          budget_range: string | null
          campaign_deadline: string | null
          campaign_goal: string | null
          campaign_name: string | null
          content_types: string[]
          created_at: string
          creator_categories: string[]
          id: string
          platforms: string[]
          preferred_creator_size: string | null
          project_id: string
          target_audience: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_notes?: string | null
          audience_location?: string | null
          brand_notes?: string | null
          budget_range?: string | null
          campaign_deadline?: string | null
          campaign_goal?: string | null
          campaign_name?: string | null
          content_types?: string[]
          created_at?: string
          creator_categories?: string[]
          id?: string
          platforms?: string[]
          preferred_creator_size?: string | null
          project_id: string
          target_audience?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_notes?: string | null
          audience_location?: string | null
          brand_notes?: string | null
          budget_range?: string | null
          campaign_deadline?: string | null
          campaign_goal?: string | null
          campaign_name?: string | null
          content_types?: string[]
          created_at?: string
          creator_categories?: string[]
          id?: string
          platforms?: string[]
          preferred_creator_size?: string | null
          project_id?: string
          target_audience?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_campaign_briefs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_outreach_drafts: {
        Row: {
          created_at: string
          creator_profile_id: string
          draft_type: string
          full_version: string | null
          id: string
          project_id: string
          short_version: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          creator_profile_id: string
          draft_type: string
          full_version?: string | null
          id?: string
          project_id: string
          short_version?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          creator_profile_id?: string
          draft_type?: string
          full_version?: string | null
          id?: string
          project_id?: string
          short_version?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_outreach_drafts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_discovery_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_outreach_drafts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_intelligence"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "project_outreach_drafts_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_outreach_drafts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_saved_creators: {
        Row: {
          booked_at: string | null
          campaign_id: string | null
          completed_at: string | null
          contact_method: string | null
          contacted_at: string | null
          created_at: string
          creator_profile_id: string
          estimated_rate: string | null
          id: string
          internal_note: string | null
          note: string | null
          outreach_draft: string | null
          priority: string
          project_id: string
          saved_by: string
          status: string
          updated_at: string
          why_fits: string | null
        }
        Insert: {
          booked_at?: string | null
          campaign_id?: string | null
          completed_at?: string | null
          contact_method?: string | null
          contacted_at?: string | null
          created_at?: string
          creator_profile_id: string
          estimated_rate?: string | null
          id?: string
          internal_note?: string | null
          note?: string | null
          outreach_draft?: string | null
          priority?: string
          project_id: string
          saved_by: string
          status?: string
          updated_at?: string
          why_fits?: string | null
        }
        Update: {
          booked_at?: string | null
          campaign_id?: string | null
          completed_at?: string | null
          contact_method?: string | null
          contacted_at?: string | null
          created_at?: string
          creator_profile_id?: string
          estimated_rate?: string | null
          id?: string
          internal_note?: string | null
          note?: string | null
          outreach_draft?: string | null
          priority?: string
          project_id?: string
          saved_by?: string
          status?: string
          updated_at?: string
          why_fits?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_saved_creators_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_saved_creators_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_discovery_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_saved_creators_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_intelligence"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "project_saved_creators_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_saved_creators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_health: {
        Row: {
          consecutive_failures: number
          last_failure_at: string | null
          last_success_at: string | null
          open_until: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          last_failure_at?: string | null
          last_success_at?: string | null
          open_until?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          last_failure_at?: string | null
          last_success_at?: string | null
          open_until?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          brief_quality_rating: number | null
          campaign_id: string
          communication_rating: number | null
          content_quality_rating: number | null
          created_at: string
          id: string
          payment_reliability_rating: number | null
          professionalism_rating: number | null
          rating: number
          reliability_rating: number | null
          responsiveness_rating: number | null
          reviewed_user_id: string
          reviewer_id: string
          reviewer_role: string
          timeliness_rating: number | null
          written_review: string | null
        }
        Insert: {
          brief_quality_rating?: number | null
          campaign_id: string
          communication_rating?: number | null
          content_quality_rating?: number | null
          created_at?: string
          id?: string
          payment_reliability_rating?: number | null
          professionalism_rating?: number | null
          rating: number
          reliability_rating?: number | null
          responsiveness_rating?: number | null
          reviewed_user_id: string
          reviewer_id: string
          reviewer_role: string
          timeliness_rating?: number | null
          written_review?: string | null
        }
        Update: {
          brief_quality_rating?: number | null
          campaign_id?: string
          communication_rating?: number | null
          content_quality_rating?: number | null
          created_at?: string
          id?: string
          payment_reliability_rating?: number | null
          professionalism_rating?: number | null
          rating?: number
          reliability_rating?: number | null
          responsiveness_rating?: number | null
          reviewed_user_id?: string
          reviewer_id?: string
          reviewer_role?: string
          timeliness_rating?: number | null
          written_review?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_outputs: {
        Row: {
          chat_id: string | null
          content: string
          created_at: string
          id: string
          output_type: string
          project_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          content: string
          created_at?: string
          id?: string
          output_type?: string
          project_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          chat_id?: string | null
          content?: string
          created_at?: string
          id?: string
          output_type?: string
          project_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_outputs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      system_incidents: {
        Row: {
          category: string
          created_at: string
          detail: string
          fingerprint: string
          first_seen_at: string
          id: string
          last_alerted_at: string | null
          last_seen_at: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          detail: string
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_alerted_at?: string | null
          last_seen_at?: string
          resolved_at?: string | null
          severity: string
          status?: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          detail?: string
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_alerted_at?: string | null
          last_seen_at?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      trends: {
        Row: {
          created_at: string
          difficulty: string | null
          format: string | null
          how_to_use: string | null
          id: string
          platform: Database["public"]["Enums"]["platform"]
          sound_name: string | null
          title: string
          why_it_works: string | null
        }
        Insert: {
          created_at?: string
          difficulty?: string | null
          format?: string | null
          how_to_use?: string | null
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          sound_name?: string | null
          title: string
          why_it_works?: string | null
        }
        Update: {
          created_at?: string
          difficulty?: string | null
          format?: string | null
          how_to_use?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          sound_name?: string | null
          title?: string
          why_it_works?: string | null
        }
        Relationships: []
      }
      trust_verifications: {
        Row: {
          created_at: string
          id: string
          method: string | null
          note: string | null
          status: string
          user_id: string
          user_type: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          status?: string
          user_id: string
          user_type: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          status?: string
          user_id?: string
          user_type?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          accepted_at: string
          consent_type: string
          id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          consent_type?: string
          id?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          consent_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_report_cache: {
        Row: {
          ai_insights: string | null
          created_at: string
          id: string
          stats: Json
          user_id: string
          week_start: string
        }
        Insert: {
          ai_insights?: string | null
          created_at?: string
          id?: string
          stats?: Json
          user_id: string
          week_start: string
        }
        Update: {
          ai_insights?: string | null
          created_at?: string
          id?: string
          stats?: Json
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_daily_usage: {
        Row: {
          day: string | null
          provider: string | null
          total_requests: number | null
          user_id: string | null
        }
        Relationships: []
      }
      business_intelligence: {
        Row: {
          avg_rating_given: number | null
          business_profile_id: string | null
          company_name: string | null
          contract_completion: number | null
          industry: string | null
          payment_rate: number | null
          profile_avg_rating: number | null
          profile_review_count: number | null
          repeat_creator_rate: number | null
          total_campaigns: number | null
          total_reviews_given: number | null
          trust_last_updated: string | null
          trust_score: number | null
          trust_tier: string | null
          user_id: string | null
        }
        Relationships: []
      }
      creator_discovery_ranked: {
        Row: {
          accepts_affiliate: boolean | null
          accepts_gifted: boolean | null
          accepts_paid: boolean | null
          audience_age_range: string | null
          audience_gender_split: string | null
          audience_location: string | null
          avatar_original_url: string | null
          avg_rating: number | null
          bio: string | null
          categories: string[] | null
          created_at: string | null
          creator_stage: string | null
          creator_verification_type: string | null
          discovery_rank: number | null
          display_name: string | null
          featured_link_1: string | null
          featured_link_2: string | null
          featured_link_3: string | null
          follower_count: number | null
          id: string | null
          instagram_followers: number | null
          instagram_handle: string | null
          is_beta_pioneer: boolean | null
          is_public: boolean | null
          is_verified: boolean | null
          location: string | null
          location_area: string | null
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          media_kit_url: string | null
          niche: string | null
          platforms: string[] | null
          preferred_content_types: string[] | null
          previous_collaborations: string | null
          primary_language: string | null
          profile_image_url: string | null
          rate_range: string | null
          review_count: number | null
          status: string | null
          suspended_at: string | null
          tiktok_handle: string | null
          trust_score: number | null
          trust_tier: string | null
          updated_at: string | null
          user_id: string | null
          username: string | null
          verification_status: string | null
          youtube_handle: string | null
        }
        Relationships: []
      }
      creator_intelligence: {
        Row: {
          approval_rate: number | null
          completion_rate: number | null
          creator_profile_id: string | null
          display_name: string | null
          niche: string | null
          profile_avg_rating: number | null
          profile_review_count: number | null
          repeat_rate: number | null
          total_campaigns: number | null
          total_reviews: number | null
          trust_avg_rating: number | null
          trust_last_updated: string | null
          trust_score: number | null
          trust_tier: string | null
          user_id: string | null
        }
        Relationships: []
      }
      generated_assets_monthly_usage: {
        Row: {
          credits_used: number | null
          images: number | null
          month: string | null
          total: number | null
          user_id: string | null
          videos: number | null
        }
        Relationships: []
      }
      market_intelligence_backlog_status: {
        Row: {
          currently_deferred_by_budget: number | null
          currently_deferred_by_circuit: number | null
          currently_leased: number | null
          due_unleased: number | null
          not_yet_due: number | null
          oldest_due_since: string | null
          total_businesses_tracked: number | null
        }
        Relationships: []
      }
      my_monthly_usage: {
        Row: {
          credits_used: number | null
          images: number | null
          month: string | null
          total: number | null
          videos: number | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          business_stage: string | null
          created_at: string | null
          id: string | null
          is_beta_pioneer: boolean | null
          name: string | null
          niche: string | null
          onboarding_path: string | null
          platforms: string[] | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          business_stage?: string | null
          created_at?: string | null
          id?: string | null
          is_beta_pioneer?: boolean | null
          name?: string | null
          niche?: string | null
          onboarding_path?: string | null
          platforms?: string[] | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          business_stage?: string | null
          created_at?: string | null
          id?: string | null
          is_beta_pioneer?: boolean | null
          name?: string | null
          niche?: string | null
          onboarding_path?: string | null
          platforms?: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_grant_pioneer: {
        Args: { p_admin_id: string; p_note?: string; p_user_id: string }
        Returns: undefined
      }
      admin_revoke_pioneer: {
        Args: { p_admin_id: string; p_note?: string; p_user_id: string }
        Returns: undefined
      }
      admin_suspend_user: {
        Args: { p_admin_id: string; p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      admin_unsuspend_user: {
        Args: { p_admin_id: string; p_note?: string; p_user_id: string }
        Returns: undefined
      }
      admin_verify_creator: {
        Args: { p_admin_id: string; p_creator_id: string; p_note?: string }
        Returns: undefined
      }
      advance_mission_task_graph: {
        Args: { p_mission_id: string }
        Returns: undefined
      }
      cancel_mission: { Args: { p_mission_id: string }; Returns: boolean }
      check_and_increment_ai_router_quota: {
        Args: { p_daily_limit: number; p_provider: string; p_user_id: string }
        Returns: {
          allowed: boolean
          quota_limit: number
          used: number
        }[]
      }
      check_and_record_platform_spend: {
        Args: { p_cost_usd: number }
        Returns: {
          allowed: boolean
          reason: string
        }[]
      }
      check_and_reserve_automated_budget: {
        Args: {
          p_business_id: string
          p_estimated_cost_usd: number
          p_feature: string
        }
        Returns: {
          allowed: boolean
          remaining_usd: number
        }[]
      }
      claim_market_intelligence_work: {
        Args: {
          p_batch_size?: number
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: {
          business_id: string
          cursor_id: string
          search_family: string
        }[]
      }
      claim_ready_mission_tasks: {
        Args: { p_limit?: number; p_worker_id: string }
        Returns: {
          actual_cost_usd: number | null
          agent_key: string
          business_id: string
          completed_at: string | null
          created_at: string
          depends_on: string[]
          error_message: string | null
          estimated_cost_usd: number | null
          id: string
          input_data: Json
          leased_by: string | null
          leased_until: string | null
          max_retries: number
          mission_id: string
          next_attempt_at: string
          order_index: number
          output_data: Json | null
          requires_approval: boolean
          retry_count: number
          risk_level: string
          started_at: string | null
          status: string
          title: string
          tool_name: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mission_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_stripe_webhook_event: {
        Args: { p_event_id: string; p_event_type: string }
        Returns: boolean
      }
      complete_market_intelligence_work: {
        Args: {
          p_cursor_id: string
          p_error_class?: string
          p_findings_added?: number
          p_outcome: string
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_mission_task: {
        Args: {
          p_actual_cost_usd?: number
          p_error?: string
          p_output?: Json
          p_status: string
          p_task_id: string
          p_worker_id: string
        }
        Returns: boolean
      }
      compute_business_trust_score: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      compute_campaign_health: {
        Args: { p_campaign_id: string }
        Returns: number
      }
      compute_creator_trust_score: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      consume_ai_credits: {
        Args: { p_cost: number; p_user_id: string }
        Returns: {
          allowed: boolean
          is_pro: boolean
          remaining: number
        }[]
      }
      consume_higgsfield_credits: {
        Args: { p_cost: number; p_monthly_limit: number; p_user_id: string }
        Returns: {
          allowed: boolean
          remaining: number
          used: number
        }[]
      }
      create_notification: {
        Args: {
          p_body?: string
          p_link?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      decide_memory_candidate: {
        Args: { p_candidate_id: string; p_decision: string }
        Returns: string
      }
      decide_mission_approval: {
        Args: { p_approval_id: string; p_decision: string }
        Returns: {
          decision: string
          task_id: string
          tool_name: string
        }[]
      }
      decline_contract: {
        Args: { p_contract_id: string; p_reason?: string }
        Returns: Json
      }
      find_or_create_conversation: {
        Args: { p_campaign_id?: string; p_other_user_id: string }
        Returns: string
      }
      get_admin_action_log: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          admin_email: string
          admin_id: string
          created_at: string
          id: string
          payload: Json
          target_id: string
          target_type: string
        }[]
      }
      get_business_public_profile: {
        Args: { p_business_id: string }
        Returns: Json
      }
      get_cron_health: {
        Args: never
        Returns: {
          active: boolean
          jobid: number
          jobname: string
          last_run_start: string
          last_run_status: string
          run_starts: string[]
          schedule: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { conv_id: string }
        Returns: boolean
      }
      is_provider_healthy: { Args: { p_provider: string }; Returns: boolean }
      log_admin_action: {
        Args: {
          p_action: string
          p_ip_address?: string
          p_payload?: Json
          p_target_id?: string
          p_target_type?: string
          p_user_agent?: string
        }
        Returns: string
      }
      mi_backfill_cursor_rows: { Args: { p_limit?: number }; Returns: number }
      notification_relationship_exists: {
        Args: { p_caller: string; p_recipient: string; p_type: string }
        Returns: boolean
      }
      open_pending_sensitive_approvals: { Args: never; Returns: number }
      reclaim_expired_mission_task_leases: { Args: never; Returns: number }
      reconcile_stale_reservations: {
        Args: { p_max_reserved_minutes?: number }
        Returns: {
          action: string
          reservation_id: string
        }[]
      }
      record_provider_result: {
        Args: {
          p_cooldown_seconds?: number
          p_open_threshold?: number
          p_provider: string
          p_success: boolean
        }
        Returns: {
          consecutive_failures: number
          healthy: boolean
          open_until: string
        }[]
      }
      refund_ai_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      refund_higgsfield_credits: {
        Args: { p_asset_id: string; p_reason?: string }
        Returns: boolean
      }
      refund_higgsfield_credits_direct: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      release_ai_reservation: {
        Args: { p_error_message?: string; p_reservation_id: string }
        Returns: undefined
      }
      request_task_approval: {
        Args: {
          p_action_type: string
          p_financial_impact_usd?: number
          p_preview: Json
          p_risk_level: string
          p_task_id: string
          p_worker_id: string
        }
        Returns: boolean
      }
      reserve_ai_credits: {
        Args: {
          p_estimated_cost_credits: number
          p_provider: string
          p_task_type: string
          p_user_id: string
        }
        Returns: {
          allowed: boolean
          is_pro: boolean
          remaining: number
          reservation_id: string
        }[]
      }
      reserve_higgsfield_credits: {
        Args: { p_cost: number; p_monthly_limit: number; p_user_id: string }
        Returns: {
          allowed: boolean
          remaining: number
          used: number
        }[]
      }
      resolve_incident: {
        Args: { p_fingerprint: string }
        Returns: {
          incident_id: string
          was_open: boolean
        }[]
      }
      search_creators: {
        Args: {
          p_categories?: string[]
          p_compensation?: string
          p_country?: string
          p_is_pioneer?: boolean
          p_is_verified?: boolean
          p_limit?: number
          p_max_followers?: number
          p_min_followers?: number
          p_offset?: number
          p_platforms?: string[]
          p_query?: string
        }
        Returns: {
          avg_rating: number
          bio: string
          categories: string[]
          discovery_rank: number
          display_name: string
          featured_link_1: string
          follower_count: number
          id: string
          is_beta_pioneer: boolean
          is_verified: boolean
          location: string
          location_country: string
          niche: string
          platforms: string[]
          profile_image_url: string
          rate_range: string
          search_rank: number
          total_count: number
          trust_tier: string
          user_id: string
          username: string
        }[]
      }
      settle_ai_request: {
        Args: {
          p_actual_cost_credits: number
          p_actual_cost_usd: number
          p_input_tokens: number
          p_latency_ms: number
          p_model: string
          p_output_tokens: number
          p_reservation_id: string
        }
        Returns: undefined
      }
      sign_contract: {
        Args: {
          p_contract_id: string
          p_ip_address?: string
          p_user_agent?: string
        }
        Returns: Json
      }
      submit_user_stated_fact: {
        Args: {
          p_business_id: string
          p_category: string
          p_expires_at?: string
          p_fact_key: string
          p_statement: string
          p_structured_value?: Json
        }
        Returns: string
      }
      upsert_ai_recommendation: {
        Args: {
          p_action_label?: string
          p_action_link?: string
          p_body: string
          p_expires_at?: string
          p_metadata?: Json
          p_priority?: number
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      upsert_business_fact_internal: {
        Args: {
          p_agent_key: string
          p_business_id: string
          p_category: string
          p_confidence: string
          p_created_by: string
          p_expires_at: string
          p_fact_key: string
          p_mission_id: string
          p_source_reference: Json
          p_source_type: string
          p_statement: string
          p_structured_value: Json
        }
        Returns: string
      }
      upsert_incident: {
        Args: {
          p_category: string
          p_cooldown_minutes?: number
          p_detail: string
          p_fingerprint: string
          p_severity: string
          p_title: string
        }
        Returns: {
          incident_id: string
          is_new: boolean
          should_alert: boolean
        }[]
      }
      users_have_relationship: {
        Args: { p_a: string; p_b: string }
        Returns: boolean
      }
      vault_create_secret: {
        Args: { new_description?: string; new_name: string; new_secret: string }
        Returns: string
      }
      vault_read_secret: { Args: { secret_id: string }; Returns: string }
      vault_update_secret: {
        Args: { new_secret: string; secret_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "creator" | "business" | "agency" | "brand"
      calendar_status: "idea" | "drafted" | "scheduled" | "posted"
      connection_status: "connected" | "disconnected" | "pending" | "error"
      platform: "instagram" | "tiktok"
      recommendation_priority: "low" | "medium" | "high" | "critical"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["creator", "business", "agency", "brand"],
      calendar_status: ["idea", "drafted", "scheduled", "posted"],
      connection_status: ["connected", "disconnected", "pending", "error"],
      platform: ["instagram", "tiktok"],
      recommendation_priority: ["low", "medium", "high", "critical"],
    },
  },
} as const
