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
      catalogue_promotion_batches: {
        Row: { import_id: string; owner_id: string; component_key: string; catalogue_ids: string[]; payload: Json; created_at: string }
        Insert: { import_id: string; owner_id: string; component_key: string; catalogue_ids: string[]; payload: Json; created_at?: string }
        Update: { import_id?: string; owner_id?: string; component_key?: string; catalogue_ids?: string[]; payload?: Json; created_at?: string }
        Relationships: []
      }
      catalogue_imports: {
        Row: {
          id: string
          owner_id: string
          source_namespace: string
          source_sha256: string
          source_bank_id: string
          expected_rows: number
          format_version: number
          created_at: string
        }
        Insert: {
          id?: string
          owner_id?: string
          source_namespace: string
          source_sha256: string
          source_bank_id: string
          expected_rows: number
          format_version?: number
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          source_namespace?: string
          source_sha256?: string
          source_bank_id?: string
          expected_rows?: number
          format_version?: number
          created_at?: string
        }
        Relationships: []
      }
      catalogue_import_rows: {
        Row: {
          import_id: string
          owner_id: string
          catalogue_id: string
          source_content_hash: string
          source_fields: Json
          unit_tags: number[]
          display_unit: number
          group_ids: string[]
          provisional_difficulty: string
          selection_marks: number | null
          normalized: Json | null
          created_at: string
        }
        Insert: {
          import_id: string
          owner_id?: string
          catalogue_id: string
          source_content_hash: string
          source_fields: Json
          unit_tags: number[]
          display_unit: number
          group_ids?: string[]
          provisional_difficulty?: string
          selection_marks?: number | null
          normalized?: Json | null
          created_at?: string
        }
        Update: {
          import_id?: string
          owner_id?: string
          catalogue_id?: string
          source_content_hash?: string
          source_fields?: Json
          unit_tags?: number[]
          display_unit?: number
          group_ids?: string[]
          provisional_difficulty?: string
          selection_marks?: number | null
          normalized?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      exam_draft_questions: {
        Row: {
          assigned_marks: number | null
          mark_attempt_count: number | null
          created_at: string
          exam_draft_id: string
          is_locked: boolean
          position: number
          point_marks: Json | null
          question_id: string
        }
        Insert: {
          assigned_marks?: number | null
          mark_attempt_count?: number | null
          created_at?: string
          exam_draft_id: string
          is_locked?: boolean
          position: number
          point_marks?: Json | null
          question_id: string
        }
        Update: {
          assigned_marks?: number | null
          mark_attempt_count?: number | null
          created_at?: string
          exam_draft_id?: string
          is_locked?: boolean
          position?: number
          point_marks?: Json | null
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
          bank_ids: string[] | null
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
          bank_ids?: string[] | null
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
          bank_ids?: string[] | null
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
      exam_snapshot_questions: {
        Row: {
          assigned_marks: number | null
          mark_attempt_count: number | null
          created_at: string
          is_locked: boolean
          owner_id: string
          position: number
          point_marks: Json | null
          question_revision_id: string
          snapshot_id: string
          source_group_id: string | null
          structure_path: Json
          visible_number: string | null
        }
        Insert: {
          assigned_marks?: number | null
          mark_attempt_count?: number | null
          created_at?: string
          is_locked?: boolean
          owner_id?: string
          position: number
          point_marks?: Json | null
          question_revision_id: string
          snapshot_id: string
          source_group_id?: string | null
          structure_path?: Json
          visible_number?: string | null
        }
        Update: {
          assigned_marks?: number | null
          mark_attempt_count?: number | null
          created_at?: string
          is_locked?: boolean
          owner_id?: string
          position?: number
          point_marks?: Json | null
          question_revision_id?: string
          snapshot_id?: string
          source_group_id?: string | null
          structure_path?: Json
          visible_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_snapshot_questions_group_owner_fkey"
            columns: ["source_group_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "question_groups"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "exam_snapshot_questions_revision_owner_fkey"
            columns: ["question_revision_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "question_revisions"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "exam_snapshot_questions_snapshot_owner_fkey"
            columns: ["snapshot_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "exam_snapshots"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      exam_snapshots: {
        Row: {
          created_at: string
          document_status: string
          id: string
          owner_id: string
          schema_version: number
          selection_seed: number
          settings: Json
          source_draft_id: string | null
          structure: Json
          total_marks: number
          two_page_approved: boolean
        }
        Insert: {
          created_at?: string
          document_status?: string
          id?: string
          owner_id?: string
          schema_version?: number
          selection_seed: number
          settings: Json
          source_draft_id?: string | null
          structure: Json
          total_marks: number
          two_page_approved?: boolean
        }
        Update: {
          created_at?: string
          document_status?: string
          id?: string
          owner_id?: string
          schema_version?: number
          selection_seed?: number
          settings?: Json
          source_draft_id?: string | null
          structure?: Json
          total_marks?: number
          two_page_approved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "exam_snapshots_source_draft_owner_fkey"
            columns: ["source_draft_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "exam_drafts"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      question_bank_memberships: {
        Row: {
          bank_id: string
          created_at: string
          owner_id: string
          question_id: string
        }
        Insert: {
          bank_id: string
          created_at?: string
          owner_id?: string
          question_id: string
        }
        Update: {
          bank_id?: string
          created_at?: string
          owner_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_memberships_bank_owner_fkey"
            columns: ["bank_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "question_bank_memberships_question_owner_fkey"
            columns: ["question_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      question_banks: {
        Row: {
          collection_unit: number | null
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
          collection_unit?: number | null
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
          collection_unit?: number | null
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
      question_group_questions: {
        Row: {
          created_at: string
          group_id: string
          owner_id: string
          position: number
          question_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          owner_id?: string
          position: number
          question_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          owner_id?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_group_questions_group_owner_fkey"
            columns: ["group_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "question_groups"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "question_group_questions_question_owner_fkey"
            columns: ["question_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      question_groups: {
        Row: {
          attempt_count: number | null
          content: Json
          created_at: string
          expected_marks: number | null
          group_type: string
          id: string
          instructions: string | null
          label: string | null
          owner_id: string
          parent_group_id: string | null
          position: number | null
          revision: number
          schema_version: number
          title: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number | null
          content: Json
          created_at?: string
          expected_marks?: number | null
          group_type: string
          id?: string
          instructions?: string | null
          label?: string | null
          owner_id?: string
          parent_group_id?: string | null
          position?: number | null
          revision?: number
          schema_version?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number | null
          content?: Json
          created_at?: string
          expected_marks?: number | null
          group_type?: string
          id?: string
          instructions?: string | null
          label?: string | null
          owner_id?: string
          parent_group_id?: string | null
          position?: number | null
          revision?: number
          schema_version?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_groups_parent_owner_fkey"
            columns: ["parent_group_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "question_groups"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      question_revisions: {
        Row: {
          answer: Json
          bank_id: string
          content: Json
          created_at: string
          difficulty: string
          external_id: string
          id: string
          is_active: boolean
          lesson: string
          marks: number | null
          owner_id: string
          prompt: string
          question_id: string
          question_type: string
          revision: number
          schema_version: number
          unit: number
        }
        Insert: {
          answer: Json
          bank_id: string
          content: Json
          created_at?: string
          difficulty: string
          external_id: string
          id?: string
          is_active: boolean
          lesson: string
          marks?: number | null
          owner_id: string
          prompt: string
          question_id: string
          question_type: string
          revision: number
          schema_version: number
          unit: number
        }
        Update: {
          answer?: Json
          bank_id?: string
          content?: Json
          created_at?: string
          difficulty?: string
          external_id?: string
          id?: string
          is_active?: boolean
          lesson?: string
          marks?: number | null
          owner_id?: string
          prompt?: string
          question_id?: string
          question_type?: string
          revision?: number
          schema_version?: number
          unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_revisions_bank_owner_fkey"
            columns: ["bank_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "question_revisions_question_owner_fkey"
            columns: ["question_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      questions: {
        Row: {
          answer: Json
          bank_id: string
          content: Json
          correct_option_label: string | null
          created_at: string
          current_revision: number
          difficulty: string
          external_id: string
          id: string
          is_active: boolean
          lesson: string
          marks: number | null
          options: Json | null
          owner_id: string
          prompt: string
          question_type: string
          schema_version: number
          unit: number
          updated_at: string
        }
        Insert: {
          answer: Json
          bank_id: string
          content: Json
          correct_option_label?: string | null
          created_at?: string
          current_revision?: number
          difficulty: string
          external_id: string
          id?: string
          is_active?: boolean
          lesson: string
          marks?: number | null
          options?: Json | null
          owner_id?: string
          prompt: string
          question_type?: string
          schema_version?: number
          unit: number
          updated_at?: string
        }
        Update: {
          answer?: Json
          bank_id?: string
          content?: Json
          correct_option_label?: string | null
          created_at?: string
          current_revision?: number
          difficulty?: string
          external_id?: string
          id?: string
          is_active?: boolean
          lesson?: string
          marks?: number | null
          options?: Json | null
          owner_id?: string
          prompt?: string
          question_type?: string
          schema_version?: number
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
          {
            foreignKeyName: "questions_bank_owner_fkey"
            columns: ["bank_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
    }
    Views: {
      catalogue_staging_bank_rows: {
        Row: {
          import_id: string | null
          catalogue_id: string | null
          bank_id: string | null
          owner_id: string | null
          display_unit: number | null
          unit_tags: number[] | null
          selection_marks: number | null
          provisional_difficulty: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_grade_six_preset_coverage: { Args: Record<PropertyKey, never>; Returns: Json }
      assign_preset_question_ideas: { Args: {p_entries:Json;p_reason:string}; Returns:number }
      get_eligible_simple_preset_groups: { Args: { p_after?: string | null; p_limit?: number }; Returns: Json }
      finalize_simple_preset_group: { Args: { p_request_id: string; p_settings: Json; p_group_id: string; p_group_revision: number; p_marks: number }; Returns: Json }
      get_simple_preset_group_exams: { Args: Record<PropertyKey, never>; Returns: Json }
      get_reviewed_preset_exercises: { Args: { p_after?: string | null; p_limit?: number }; Returns: Json }
      finalize_reviewed_preset_exercise: { Args: { p_request_id: string; p_settings: Json; p_exercise: Json }; Returns: Json }
      get_reviewed_preset_exercise_exam: { Args: { p_id: string }; Returns: Json }
      stage_preset_provenance_batch: { Args: { p_id:string; p_import_id:string; p_source_sha256:string; p_schema_version:number; p_mapping_version:number; p_entries:Json; p_reason:string }; Returns:Json }
      get_eligible_simple_presets: { Args: { p_after: string | null; p_limit: number }; Returns: Json }
      finalize_simple_preset_exam: { Args: { p_request_id: string; p_settings: Json; p_selections: Json }; Returns: Json }
      get_simple_preset_exams: { Args: Record<string, never>; Returns: Json }
      publish_preset_revision: { Args: { p_id: string; p_expected_version: number; p_public_provenance: Json; p_reason: string }; Returns: Json }
      get_preset_curation: { Args: { p_bank_id: string }; Returns: Json }
      get_preset_curation_view: {
        Args: { p_bank_id: string; p_search?: string; p_revision_id?: string | null; p_record_limit?: number; p_target_limit?: number }
        Returns: Json
      }
      get_preset_provenance_readback: { Args: { p_bank_id: string; p_ids: string[] }; Returns: Json }
      get_preset_intake_candidates: { Args: { p_bank_id: string; p_question_ids: string[] }; Returns: Json }
      save_preset_provenance: {
        Args: { p_id: string; p_bank_id: string; p_revision_id: string | null; p_expected_version: number;
          p_provenance: Json; p_private_notes: string; p_reason: string }
        Returns: string
      }
      transition_preset_curation: {
        Args: { p_id: string; p_expected_version: number; p_state: string; p_reason: string }
        Returns: number
      }
      attach_catalogue_mapping: {
        Args: { p_import_id: string; p_rows: Json }
        Returns: number
      }
      commit_catalogue_component: {
        Args: { p_import_id: string; p_payload: Json }
        Returns: Json
      }
      stage_catalogue_import_batch: {
        Args: { p_import_id: string; p_rows: Json }
        Returns: Json
      }
      remove_group_from_bank: {
        Args: { p_bank_id: string; p_group_id: string }
        Returns: number
      }
      create_bank_from_banks: {
        Args: { p_name: string; p_source_bank_ids: string[] }
        Returns: string
      }
      save_passage_group: {
        Args: {
          p_id: string
          p_expected_revision: number
          p_bank_id: string
          p_title: string | null
          p_instruction: string
          p_arabic_instruction: string | null
          p_passage: string
          p_attempt_count: number
          p_expected_marks: number | null
          p_question_ids: string[]
        }
        Returns: Json
      }
      save_phase_nine_draft: {
        Args: { p_id: string; p_expected_version: number; p_request_id: string; p_workflow: Json }
        Returns: Json
      }
      save_exam_blueprint: {
        Args: { p_id: string; p_expected_version: number; p_request_id: string; p_workflow: Json }
        Returns: Json
      }
      get_bank_question_pool: {
        Args: { p_bank_ids: string[]; p_active_only?: boolean; p_standalone_only?: boolean }
        Returns: Json
      }
      get_exam_blueprints: {
        Args: { p_before?: string | null; p_before_id?: string | null; p_limit?: number }
        Returns: Json
      }
      finalize_blueprint_paper: {
        Args: { p_request_id: string; p_draft_id: string; p_expected_version: number; p_workflow: Json }
        Returns: Json
      }
      get_blueprint_papers: {
        Args: { p_before?: string | null; p_before_id?: string | null; p_limit?: number }
        Returns: Json
      }
      finalize_phase_nine_exam: {
        Args: { p_request_id: string; p_draft_id: string; p_expected_version: number; p_workflow: Json }
        Returns: Json
      }
      get_phase_nine_workflows: {
        Args: Record<string, never>
        Returns: Json
      }
      save_phase_ten_candidate_draft: {
        Args: { p_id: string; p_expected_version: number; p_request_id: string; p_workflow: Json }
        Returns: Json
      }
      finalize_phase_ten_candidate: {
        Args: { p_request_id: string; p_draft_id: string; p_expected_version: number; p_workflow: Json }
        Returns: Json
      }
      get_phase_ten_candidate_workflows: {
        Args: Record<string, never>
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
