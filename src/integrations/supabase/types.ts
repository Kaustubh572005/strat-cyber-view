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
  public: {
    Tables: {
      conversations: {
        Row: {
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          bcc_recipients: Json
          body: string
          cc_recipients: Json
          created_at: string
          id: string
          reply_to_message_id: string | null
          status: string
          subject: string
          to_recipients: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          bcc_recipients?: Json
          body?: string
          cc_recipients?: Json
          created_at?: string
          id?: string
          reply_to_message_id?: string | null
          status?: string
          subject?: string
          to_recipients?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          bcc_recipients?: Json
          body?: string
          cc_recipients?: Json
          created_at?: string
          id?: string
          reply_to_message_id?: string | null
          status?: string
          subject?: string
          to_recipients?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feed_articles: {
        Row: {
          ai_impact: string | null
          ai_summary: string | null
          attachment_url: string | null
          category: string | null
          created_at: string
          external_id: string
          id: string
          published_at: string | null
          publisher: string | null
          raw: Json | null
          severity: string | null
          snippet: string | null
          source_key: string
          title: string
          url: string
        }
        Insert: {
          ai_impact?: string | null
          ai_summary?: string | null
          attachment_url?: string | null
          category?: string | null
          created_at?: string
          external_id: string
          id?: string
          published_at?: string | null
          publisher?: string | null
          raw?: Json | null
          severity?: string | null
          snippet?: string | null
          source_key: string
          title: string
          url: string
        }
        Update: {
          ai_impact?: string | null
          ai_summary?: string | null
          attachment_url?: string | null
          category?: string | null
          created_at?: string
          external_id?: string
          id?: string
          published_at?: string | null
          publisher?: string | null
          raw?: Json | null
          severity?: string | null
          snippet?: string | null
          source_key?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_articles_source_key_fkey"
            columns: ["source_key"]
            isOneToOne: false
            referencedRelation: "feed_sources"
            referencedColumns: ["source_key"]
          },
        ]
      }
      feed_items: {
        Row: {
          ai_summary: string | null
          created_at: string
          description: string | null
          first_seen_at: string
          id: string
          link: string
          published_at: string | null
          publisher: string | null
          severity: string | null
          source: string
          title: string
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          description?: string | null
          first_seen_at?: string
          id?: string
          link: string
          published_at?: string | null
          publisher?: string | null
          severity?: string | null
          source: string
          title: string
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          description?: string | null
          first_seen_at?: string
          id?: string
          link?: string
          published_at?: string | null
          publisher?: string | null
          severity?: string | null
          source?: string
          title?: string
        }
        Relationships: []
      }
      feed_sources: {
        Row: {
          category: string
          display_name: string
          last_added_count: number
          last_error: string | null
          last_status: string | null
          last_synced_at: string | null
          source_key: string
          updated_at: string
        }
        Insert: {
          category?: string
          display_name: string
          last_added_count?: number
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          source_key: string
          updated_at?: string
        }
        Update: {
          category?: string
          display_name?: string
          last_added_count?: number
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          source_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          kind: string
          parts: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          kind?: string
          parts?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: string
          parts?: Json | null
          role?: string
          user_id?: string
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
      microsoft_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          ms_account_id: string | null
          ms_display_name: string | null
          ms_email: string | null
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          ms_account_id?: string | null
          ms_display_name?: string | null
          ms_email?: string | null
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          ms_account_id?: string | null
          ms_display_name?: string | null
          ms_email?: string | null
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_dismissals: {
        Row: {
          dismissed_at: string
          notification_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          notification_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          notification_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_dismissals_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          article_id: string | null
          body: string | null
          created_at: string
          id: string
          link: string | null
          severity: string | null
          source_key: string
          title: string
        }
        Insert: {
          article_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          severity?: string | null
          source_key: string
          title: string
        }
        Update: {
          article_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          severity?: string | null
          source_key?: string
          title?: string
        }
        Relationships: []
      }
      nse_disclosures: {
        Row: {
          ai_impact: string | null
          ai_summary: string | null
          attachment_url: string | null
          company_name: string | null
          created_at: string
          details: string | null
          external_id: string
          external_url: string | null
          id: string
          incident_type: string | null
          notice_datetime: string | null
          raw: Json | null
          subject: string | null
          symbol: string | null
        }
        Insert: {
          ai_impact?: string | null
          ai_summary?: string | null
          attachment_url?: string | null
          company_name?: string | null
          created_at?: string
          details?: string | null
          external_id: string
          external_url?: string | null
          id?: string
          incident_type?: string | null
          notice_datetime?: string | null
          raw?: Json | null
          subject?: string | null
          symbol?: string | null
        }
        Update: {
          ai_impact?: string | null
          ai_summary?: string | null
          attachment_url?: string | null
          company_name?: string | null
          created_at?: string
          details?: string | null
          external_id?: string
          external_url?: string | null
          id?: string
          incident_type?: string | null
          notice_datetime?: string | null
          raw?: Json | null
          subject?: string | null
          symbol?: string | null
        }
        Relationships: []
      }
      presentation_templates: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          size_bytes: number
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          size_bytes?: number
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          ms_display_name: string | null
          ms_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          ms_display_name?: string | null
          ms_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          ms_display_name?: string | null
          ms_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          added_count: number
          error: string | null
          finished_at: string | null
          id: string
          source_key: string
          started_at: string
          status: string
        }
        Insert: {
          added_count?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          source_key: string
          started_at?: string
          status?: string
        }
        Update: {
          added_count?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          source_key?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          auto_speak: boolean
          tone: string
          updated_at: string
          user_id: string
          voice: string
        }
        Insert: {
          auto_speak?: boolean
          tone?: string
          updated_at?: string
          user_id: string
          voice?: string
        }
        Update: {
          auto_speak?: boolean
          tone?: string
          updated_at?: string
          user_id?: string
          voice?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
