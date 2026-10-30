export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          company_id: string;
          created_at: string;
          full_name: string;
          id: string;
          phone: string | null;
          role: Database["public"]["Enums"]["account_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          role: Database["public"]["Enums"]["account_role"];
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["account_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          created_at: string;
          default_currency: string;
          default_locale: string;
          id: string;
          name: string;
          slug: string;
          tax_rate_bps: number;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          default_currency: string;
          default_locale?: string;
          id?: string;
          name: string;
          slug: string;
          tax_rate_bps?: number;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_currency?: string;
          default_locale?: string;
          id?: string;
          name?: string;
          slug?: string;
          tax_rate_bps?: number;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          amount_minor: number;
          category: Database["public"]["Enums"]["expense_category"];
          company_id: string;
          created_at: string;
          created_by_account_id: string | null;
          currency: string;
          id: string;
          notes: string;
          occurred_on: string;
          vehicle_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          category: Database["public"]["Enums"]["expense_category"];
          company_id: string;
          created_at?: string;
          created_by_account_id?: string | null;
          currency: string;
          id?: string;
          notes?: string;
          occurred_on?: string;
          vehicle_id: string;
        };
        Update: {
          amount_minor?: number;
          category?: Database["public"]["Enums"]["expense_category"];
          company_id?: string;
          created_at?: string;
          created_by_account_id?: string | null;
          currency?: string;
          id?: string;
          notes?: string;
          occurred_on?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_created_by_account_id_fkey";
            columns: ["created_by_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          address: string;
          company_id: string;
          created_at: string;
          id: string;
          name: string;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          company_id: string;
          created_at?: string;
          id?: string;
          name: string;
          timezone?: string;
        };
        Update: {
          address?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          timezone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          account_id: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          company_id: string;
          content: NonNullable<Json>;
          created_at: string;
          id: string;
          sent_at: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          type: Database["public"]["Enums"]["notification_type"];
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          company_id: string;
          content?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          type: Database["public"]["Enums"]["notification_type"];
        };
        Update: {
          account_id?: string;
          channel?: Database["public"]["Enums"]["notification_channel"];
          company_id?: string;
          content?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          type?: Database["public"]["Enums"]["notification_type"];
        };
        Relationships: [
          {
            foreignKeyName: "notifications_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_minor: number;
          company_id: string;
          created_at: string;
          currency: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          provider: string;
          provider_payment_id: string | null;
          rental_id: string | null;
          reservation_id: string | null;
          status: Database["public"]["Enums"]["payment_status"];
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          company_id: string;
          created_at?: string;
          currency: string;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          provider?: string;
          provider_payment_id?: string | null;
          rental_id?: string | null;
          reservation_id?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Update: {
          amount_minor?: number;
          company_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          provider?: string;
          provider_payment_id?: string | null;
          rental_id?: string | null;
          reservation_id?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_rental_id_fkey";
            columns: ["rental_id"];
            isOneToOne: false;
            referencedRelation: "rentals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
        ];
      };
      rental_extras: {
        Row: {
          company_id: string;
          cost_minor: number;
          created_at: string;
          currency: string;
          details: NonNullable<Json>;
          id: string;
          item_type: Database["public"]["Enums"]["extra_item_type"];
          label: string;
          rental_id: string | null;
          reservation_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          cost_minor?: number;
          created_at?: string;
          currency: string;
          details?: NonNullable<Json>;
          id?: string;
          item_type: Database["public"]["Enums"]["extra_item_type"];
          label: string;
          rental_id?: string | null;
          reservation_id?: string | null;
        };
        Update: {
          company_id?: string;
          cost_minor?: number;
          created_at?: string;
          currency?: string;
          details?: NonNullable<Json>;
          id?: string;
          item_type?: Database["public"]["Enums"]["extra_item_type"];
          label?: string;
          rental_id?: string | null;
          reservation_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rental_extras_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rental_extras_rental_id_fkey";
            columns: ["rental_id"];
            isOneToOne: false;
            referencedRelation: "rentals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rental_extras_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
        ];
      };
      rentals: {
        Row: {
          company_id: string;
          created_at: string;
          currency: string;
          ended_at: string | null;
          expected_return_at: string | null;
          extras_minor: number;
          id: string;
          late_fee_minor: number;
          member_account_id: string;
          odometer_end: number | null;
          odometer_start: number;
          reservation_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["rental_status"];
          subtotal_minor: number;
          tariff_snapshot: NonNullable<Json>;
          tax_minor: number;
          total_minor: number;
          updated_at: string;
          vehicle_id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          currency: string;
          ended_at?: string | null;
          expected_return_at?: string | null;
          extras_minor?: number;
          id?: string;
          late_fee_minor?: number;
          member_account_id: string;
          odometer_end?: number | null;
          odometer_start: number;
          reservation_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["rental_status"];
          subtotal_minor?: number;
          tariff_snapshot?: NonNullable<Json>;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          vehicle_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          currency?: string;
          ended_at?: string | null;
          expected_return_at?: string | null;
          extras_minor?: number;
          id?: string;
          late_fee_minor?: number;
          member_account_id?: string;
          odometer_end?: number | null;
          odometer_start?: number;
          reservation_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["rental_status"];
          subtotal_minor?: number;
          tariff_snapshot?: NonNullable<Json>;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rentals_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rentals_member_account_id_fkey";
            columns: ["member_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rentals_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rentals_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      reservations: {
        Row: {
          company_id: string;
          created_at: string;
          created_by_account_id: string | null;
          currency: string;
          during: unknown;
          end_at: string;
          id: string;
          location_id: string | null;
          member_account_id: string;
          start_at: string;
          status: Database["public"]["Enums"]["reservation_status"];
          subtotal_minor: number;
          tariff_snapshot: NonNullable<Json>;
          tax_minor: number;
          total_minor: number;
          updated_at: string;
          vehicle_id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          created_by_account_id?: string | null;
          currency: string;
          during?: never;
          end_at: string;
          id?: string;
          location_id?: string | null;
          member_account_id: string;
          start_at: string;
          status?: Database["public"]["Enums"]["reservation_status"];
          subtotal_minor?: number;
          tariff_snapshot?: NonNullable<Json>;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          vehicle_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by_account_id?: string | null;
          currency?: string;
          during?: never;
          end_at?: string;
          id?: string;
          location_id?: string | null;
          member_account_id?: string;
          start_at?: string;
          status?: Database["public"]["Enums"]["reservation_status"];
          subtotal_minor?: number;
          tariff_snapshot?: NonNullable<Json>;
          tax_minor?: number;
          total_minor?: number;
          updated_at?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reservations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_created_by_account_id_fkey";
            columns: ["created_by_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_member_account_id_fkey";
            columns: ["member_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      tariffs: {
        Row: {
          company_id: string;
          created_at: string;
          currency: string;
          daily_rate_minor: number;
          grace_period_minutes: number;
          hourly_rate_minor: number;
          id: string;
          late_fee_per_hour_minor: number;
          name: string;
          updated_at: string;
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null;
          weekly_rate_minor: number;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          currency: string;
          daily_rate_minor: number;
          grace_period_minutes?: number;
          hourly_rate_minor: number;
          id?: string;
          late_fee_per_hour_minor: number;
          name?: string;
          updated_at?: string;
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null;
          weekly_rate_minor: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          currency?: string;
          daily_rate_minor?: number;
          grace_period_minutes?: number;
          hourly_rate_minor?: number;
          id?: string;
          late_fee_per_hour_minor?: number;
          name?: string;
          updated_at?: string;
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null;
          weekly_rate_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tariffs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_logs: {
        Row: {
          actor_account_id: string | null;
          company_id: string;
          event_type: Database["public"]["Enums"]["vehicle_log_event"];
          id: string;
          occurred_at: string;
          payload: NonNullable<Json>;
          vehicle_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_account_id?: string | null;
          company_id: string;
          event_type: Database["public"]["Enums"]["vehicle_log_event"];
          id?: string;
          occurred_at?: string;
          payload?: NonNullable<Json>;
          vehicle_id: string;
        };
        Update: {
          actor_account_id?: string | null;
          company_id?: string;
          event_type?: Database["public"]["Enums"]["vehicle_log_event"];
          id?: string;
          occurred_at?: string;
          payload?: NonNullable<Json>;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_logs_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_logs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_logs_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicles: {
        Row: {
          barcode: string;
          color: string;
          company_id: string;
          created_at: string;
          fuel_or_charge_level: number;
          fuel_type: Database["public"]["Enums"]["fuel_type"];
          id: string;
          level_source: Database["public"]["Enums"]["level_source"];
          license_plate: string;
          location_id: string | null;
          model: string;
          model_glb_key: string | null;
          odometer: number;
          parking_stall: string | null;
          status: Database["public"]["Enums"]["vehicle_status"];
          subtype: string;
          type: Database["public"]["Enums"]["vehicle_type"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          barcode: string;
          color?: string;
          company_id: string;
          created_at?: string;
          fuel_or_charge_level?: number;
          fuel_type: Database["public"]["Enums"]["fuel_type"];
          id?: string;
          level_source?: Database["public"]["Enums"]["level_source"];
          license_plate: string;
          location_id?: string | null;
          model: string;
          model_glb_key?: string | null;
          odometer?: number;
          parking_stall?: string | null;
          status?: Database["public"]["Enums"]["vehicle_status"];
          subtype: string;
          type: Database["public"]["Enums"]["vehicle_type"];
          updated_at?: string;
        };
        Update: {
          barcode?: string;
          color?: string;
          company_id?: string;
          created_at?: string;
          fuel_or_charge_level?: number;
          fuel_type?: Database["public"]["Enums"]["fuel_type"];
          id?: string;
          level_source?: Database["public"]["Enums"]["level_source"];
          license_plate?: string;
          location_id?: string | null;
          model?: string;
          model_glb_key?: string | null;
          odometer?: number;
          parking_stall?: string | null;
          status?: Database["public"]["Enums"]["vehicle_status"];
          subtype?: string;
          type?: Database["public"]["Enums"]["vehicle_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicles_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_company: {
        Args: {
          p_default_currency: string;
          p_default_locale?: string;
          p_name: string;
          p_slug: string;
          p_timezone?: string;
        };
        Returns: {
          created_at: string;
          default_currency: string;
          default_locale: string;
          id: string;
          name: string;
          slug: string;
          tax_rate_bps: number;
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "companies";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_company_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      current_role_in_company: {
        Args: { target_company_id: string };
        Returns: Database["public"]["Enums"]["account_role"];
      };
      is_staff_in_company: { Args: { target_company_id: string }; Returns: boolean };
      join_company_as_member: {
        Args: { p_company_slug: string };
        Returns: {
          company_id: string;
          created_at: string;
          full_name: string;
          id: string;
          phone: string | null;
          role: Database["public"]["Enums"]["account_role"];
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "accounts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      my_account_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      public_company_by_slug: {
        Args: { p_slug: string };
        Returns: {
          default_currency: string;
          default_locale: string;
          id: string;
          name: string;
          tax_rate_bps: number;
          timezone: string;
        }[];
      };
      public_tariff_for_vehicle_type: {
        Args: {
          p_company_slug: string;
          p_vehicle_type: Database["public"]["Enums"]["vehicle_type"];
        };
        Returns: {
          currency: string;
          daily_rate_minor: number;
          grace_period_minutes: number;
          hourly_rate_minor: number;
          late_fee_per_hour_minor: number;
          weekly_rate_minor: number;
        }[];
      };
      public_vehicle_by_id: {
        Args: { p_vehicle_id: string };
        Returns: {
          color: string;
          company_id: string;
          fuel_type: Database["public"]["Enums"]["fuel_type"];
          model: string;
          model_glb_key: string;
          subtype: string;
          type: Database["public"]["Enums"]["vehicle_type"];
          vehicle_id: string;
        }[];
      };
      search_available_vehicles: {
        Args: {
          p_company_slug: string;
          p_end_at: string;
          p_start_at: string;
          p_type?: Database["public"]["Enums"]["vehicle_type"];
        };
        Returns: {
          color: string;
          fuel_type: Database["public"]["Enums"]["fuel_type"];
          model: string;
          model_glb_key: string;
          subtype: string;
          type: Database["public"]["Enums"]["vehicle_type"];
          vehicle_id: string;
        }[];
      };
      vehicle_profit_report: {
        Args: { p_company_id: string; p_from: string; p_to: string };
        Returns: {
          expenses_minor: number;
          license_plate: string;
          model: string;
          profit_minor: number;
          rental_count: number;
          revenue_minor: number;
          vehicle_id: string;
        }[];
      };
    };
    Enums: {
      account_role: "owner" | "receptionist" | "worker" | "member";
      expense_category: "repair" | "insurance" | "fuel" | "wash" | "fine";
      extra_item_type: "equipment" | "service" | "additional_driver" | "insurance";
      fuel_type: "gasoline" | "diesel" | "electric" | "hybrid" | "other";
      level_source: "manual" | "photo" | "obd" | "api";
      notification_channel: "email" | "sms" | "whatsapp" | "telegram" | "push";
      notification_status: "queued" | "sent" | "failed";
      notification_type:
        | "pickup_reminder"
        | "due_soon"
        | "overdue"
        | "reservation_cancelled"
        | "service_due"
        | "insurance_expiring"
        | "reservation_confirmed";
      payment_method: "card" | "cash" | "other";
      payment_status: "pending" | "succeeded" | "failed" | "refunded";
      rental_status: "active" | "completed";
      reservation_status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
      vehicle_log_event: "status_change" | "inspection" | "service" | "note" | "pickup" | "return";
      vehicle_status: "available" | "rented" | "service";
      vehicle_type: "car" | "truck" | "suv" | "van" | "motorcycle";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_role: ["owner", "receptionist", "worker", "member"],
      expense_category: ["repair", "insurance", "fuel", "wash", "fine"],
      extra_item_type: ["equipment", "service", "additional_driver", "insurance"],
      fuel_type: ["gasoline", "diesel", "electric", "hybrid", "other"],
      level_source: ["manual", "photo", "obd", "api"],
      notification_channel: ["email", "sms", "whatsapp", "telegram", "push"],
      notification_status: ["queued", "sent", "failed"],
      notification_type: [
        "pickup_reminder",
        "due_soon",
        "overdue",
        "reservation_cancelled",
        "service_due",
        "insurance_expiring",
        "reservation_confirmed",
      ],
      payment_method: ["card", "cash", "other"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      rental_status: ["active", "completed"],
      reservation_status: ["pending", "confirmed", "cancelled", "completed", "no_show"],
      vehicle_log_event: ["status_change", "inspection", "service", "note", "pickup", "return"],
      vehicle_status: ["available", "rented", "service"],
      vehicle_type: ["car", "truck", "suv", "van", "motorcycle"],
    },
  },
} as const;
