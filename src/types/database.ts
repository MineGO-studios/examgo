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
      exam_draft_questions: {
        Row: {
          created_at: string
          exam_draft_id: string
          is_locked: boolean
          position: number
          question_id: string
        }
        Insert: {
          created_at?: string
          exam_draft_id: string
          is_locked?: boolean
          position: number
          question_id: string
        }
        Update: {
          created_at?: string
          exam_draft_id?: string
          is_locked?: boolean
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_draft_questions_exam_draft_id_fkey"
            columns: ["exam_draft_id"]
            isOneToOne: false
            referencedRelation: "exam_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_draft_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_drafts: {
        Row: {
          bank_id: string
          created_at: string
          exam_title: string
          grade: number
          id: string
          marks_per_question: number
          owner_id: string
          question_count: number
          school_name: string
          selection_seed: number
          status: string
          unit: number
          updated_at: string
        }
        Insert: {
          bank_id: string
          created_at?: string
          exam_title: string
          grade: number
          id?: string
          marks_per_question: number
          owner_id?: string
          question_count: number
          school_name: string
          selection_seed: number
          status?: string
          unit: number
          updated_at?: string
        }
        Update: {
          bank_id?: string
          created_at?: string
          exam_title?: string
          grade?: number
          id?: string
          marks_per_question?: number
          owner_id?: string
          question_count?: number
          school_name?: string
          selection_seed?: number
          status?: string
          unit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_drafts_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      question_banks: {
        Row: {
          created_at: string
          curriculum: string
          grade: number
          id: string
          is_archived: boolean
          name: string
          owner_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          curriculum?: string
          grade: number
          id?: string
          is_archived?: boolean
          name: string
          owner_id?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          curriculum?: string
          grade?: number
          id?: string
          is_archived?: boolean
          name?: string
          owner_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          bank_id: string
          correct_option_label: string
          created_at: string
          difficulty: string
          external_id: string
          id: string
          is_active: boolean
          lesson: string
          options: Json
          prompt: string
          question_type: string
          unit: number
          updated_at: string
        }
        Insert: {
          bank_id: string
          correct_option_label: string
          created_at?: string
          difficulty: string
          external_id: string
          id?: string
          is_active?: boolean
          lesson: string
          options: Json
          prompt: string
          question_type?: string
          unit: number
          updated_at?: string
        }
        Update: {
          bank_id?: string
          correct_option_label?: string
          created_at?: string
          difficulty?: string
          external_id?: string
          id?: string
          is_active?: boolean
          lesson?: string
          options?: Json
          prompt?: string
          question_type?: string
          unit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
        ]
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
    Enums: {},
  },
} as const
