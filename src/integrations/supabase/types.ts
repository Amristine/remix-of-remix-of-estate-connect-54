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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      data_batches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      data_records: {
        Row: {
          assigned_to: string | null
          batch_id: string | null
          converted_at: string | null
          converted_lead_id: string | null
          created_at: string
          email: string | null
          id: string
          is_duplicate: boolean
          location: string | null
          name: string
          phone: string
          status: Database["public"]["Enums"]["data_status"]
        }
        Insert: {
          assigned_to?: string | null
          batch_id?: string | null
          converted_at?: string | null
          converted_lead_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_duplicate?: boolean
          location?: string | null
          name: string
          phone: string
          status?: Database["public"]["Enums"]["data_status"]
        }
        Update: {
          assigned_to?: string | null
          batch_id?: string | null
          converted_at?: string | null
          converted_lead_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_duplicate?: boolean
          location?: string | null
          name?: string
          phone?: string
          status?: Database["public"]["Enums"]["data_status"]
        }
        Relationships: [
          {
            foreignKeyName: "data_records_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "data_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_records_converted_lead_id_fkey"
            columns: ["converted_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_payments: {
        Row: {
          amount: number
          created_at: string
          deal_id: string
          id: string
          milestone_id: string
          notes: string | null
          paid_on: string
          payment_method: string
          receipt_number: string
          recorded_by: string
          reference_no: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          deal_id: string
          id?: string
          milestone_id: string
          notes?: string | null
          paid_on?: string
          payment_method: string
          receipt_number: string
          recorded_by: string
          reference_no?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          deal_id?: string
          id?: string
          milestone_id?: string
          notes?: string | null
          paid_on?: string
          payment_method?: string
          receipt_number?: string
          recorded_by?: string
          reference_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_payments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_payments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          agreed_price: number
          assigned_to: string
          base_price: number
          booking_date: string
          created_at: string
          discount_amount: number
          id: string
          lead_id: string
          notes: string | null
          payment_plan: string
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          agreed_price: number
          assigned_to: string
          base_price: number
          booking_date?: string
          created_at?: string
          discount_amount?: number
          id?: string
          lead_id: string
          notes?: string | null
          payment_plan?: string
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          agreed_price?: number
          assigned_to?: string
          base_price?: number
          booking_date?: string
          created_at?: string
          discount_amount?: number
          id?: string
          lead_id?: string
          notes?: string | null
          payment_plan?: string
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          type: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          type?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_forms: {
        Row: {
          created_at: string
          created_by: string | null
          headline: string | null
          id: string
          is_active: boolean
          name: string
          platform: Database["public"]["Enums"]["lead_source"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          headline?: string | null
          id?: string
          is_active?: boolean
          name: string
          platform?: Database["public"]["Enums"]["lead_source"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          headline?: string | null
          id?: string
          is_active?: boolean
          name?: string
          platform?: Database["public"]["Enums"]["lead_source"]
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string | null
          budget: number | null
          created_at: string
          data_record_id: string | null
          email: string | null
          form_id: string | null
          id: string
          location: string | null
          name: string
          next_follow_up: string | null
          phone: string
          property_interest: Database["public"]["Enums"]["property_type"] | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          budget?: number | null
          created_at?: string
          data_record_id?: string | null
          email?: string | null
          form_id?: string | null
          id?: string
          location?: string | null
          name: string
          next_follow_up?: string | null
          phone: string
          property_interest?:
            | Database["public"]["Enums"]["property_type"]
            | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          budget?: number | null
          created_at?: string
          data_record_id?: string | null
          email?: string | null
          form_id?: string | null
          id?: string
          location?: string | null
          name?: string
          next_follow_up?: string | null
          phone?: string
          property_interest?:
            | Database["public"]["Enums"]["property_type"]
            | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "lead_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestones: {
        Row: {
          amount_due: number
          created_at: string
          deal_id: string
          due_date: string | null
          id: string
          name: string
          order_index: number
          percentage: number
        }
        Insert: {
          amount_due: number
          created_at?: string
          deal_id: string
          due_date?: string | null
          id?: string
          name: string
          order_index: number
          percentage: number
        }
        Update: {
          amount_due?: number
          created_at?: string
          deal_id?: string
          due_date?: string | null
          id?: string
          name?: string
          order_index?: number
          percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestones_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          location: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          created_at: string
          id: string
          lead_id: string | null
          notes: string | null
          price: number | null
          project_id: string
          sqft: number | null
          status: Database["public"]["Enums"]["unit_status"]
          tower: string | null
          unit_number: string
          unit_type: Database["public"]["Enums"]["property_type"] | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          price?: number | null
          project_id: string
          sqft?: number | null
          status?: Database["public"]["Enums"]["unit_status"]
          tower?: string | null
          unit_number: string
          unit_type?: Database["public"]["Enums"]["property_type"] | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          price?: number | null
          project_id?: string
          sqft?: number | null
          status?: Database["public"]["Enums"]["unit_status"]
          tower?: string | null
          unit_number?: string
          unit_type?: Database["public"]["Enums"]["property_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "units_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      cancel_deal_booking: { Args: { _deal_id: string }; Returns: undefined }
      convert_data_to_leads: { Args: { _ids: string[] }; Returns: number }
      create_deal_booking: {
        Args: {
          _base_price: number
          _booking_date: string
          _discount_amount: number
          _lead_id: string
          _milestones: Json
          _notes: string
          _payment_plan: string
          _unit_id: string
        }
        Returns: string
      }
      existing_phones: { Args: { _phones: string[] }; Returns: string[] }
      find_phone: {
        Args: { _phone: string }
        Returns: {
          kind: string
          name: string
        }[]
      }
      get_public_form: {
        Args: { _id: string }
        Returns: {
          headline: string
          id: string
          is_active: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_deal_payment: {
        Args: {
          _amount: number
          _deal_id: string
          _milestone_id: string
          _notes: string
          _paid_on: string
          _payment_method: string
          _reference_no: string
        }
        Returns: {
          payment_id: string
          receipt_number: string
        }[]
      }
      reschedule_payment_milestone: {
        Args: { _due_date: string; _milestone_id: string }
        Returns: undefined
      }
      submit_lead_form: {
        Args: {
          _email: string
          _form_id: string
          _name: string
          _phone: string
        }
        Returns: string
      }
      update_deal_status: {
        Args: { _deal_id: string; _status: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "caller"
      data_status: "Fresh" | "Called" | "Not Reachable" | "Wrong Number"
      lead_source:
        | "Facebook"
        | "Google"
        | "99acres"
        | "MagicBricks"
        | "Walk-in"
        | "Referral"
        | "Other"
        | "Instagram"
        | "YouTube"
      lead_status:
        | "New"
        | "Contacted"
        | "Interested"
        | "Site Visit Scheduled"
        | "Site Visit Done"
        | "Negotiation"
        | "Booked"
        | "Not Interested"
        | "Lost"
      property_type: "1BHK" | "2BHK" | "3BHK" | "Plot" | "Commercial"
      unit_status: "Available" | "Blocked" | "Sold"
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
  public: {
    Enums: {
      app_role: ["admin", "caller"],
      data_status: ["Fresh", "Called", "Not Reachable", "Wrong Number"],
      lead_source: [
        "Facebook",
        "Google",
        "99acres",
        "MagicBricks",
        "Walk-in",
        "Referral",
        "Other",
        "Instagram",
        "YouTube",
      ],
      lead_status: [
        "New",
        "Contacted",
        "Interested",
        "Site Visit Scheduled",
        "Site Visit Done",
        "Negotiation",
        "Booked",
        "Not Interested",
        "Lost",
      ],
      property_type: ["1BHK", "2BHK", "3BHK", "Plot", "Commercial"],
      unit_status: ["Available", "Blocked", "Sold"],
    },
  },
} as const
