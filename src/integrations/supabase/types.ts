// Tipos do banco de dados do Marketing Hub 2.0.
// Depois de criar o projeto Supabase, você pode regenerar este arquivo com:
//   npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ModuleRow = { key: string; label: string; group_label: string; sort_order: number };

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  sort_order: number;
  created_at: string;
};

export type RolePermissionRow = {
  role_id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  scope: "all" | "own";
};

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  job_title: string;
  avatar_url: string | null;
  role_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuditLogRow = {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete" | "soft_delete" | "restore";
  changed_by: string | null;
  changed_at: string;
  old_data: Json | null;
  new_data: Json | null;
};

export type AttachmentRow = {
  id: string;
  module: string;
  record_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_by: string | null;
  created_at: string;
};

export type CommentRow = {
  id: string;
  module: string;
  record_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AppSettingRow = { key: string; value: Json; updated_by: string | null; updated_at: string };

export type MyPermissionRow = Omit<RolePermissionRow, "role_id">;

export type TrashRow = {
  table_name: string;
  module: string;
  record_id: string;
  title: string | null;
  deleted_at: string;
  deleted_by: string | null;
  purge_at: string;
};


// ---------------------------------------------------------------- Fase 2 — Operação
type Stamped = {
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ApprovalStatus = "Não solicitada" | "Aguardando" | "Aprovada" | "Reprovada";

type Approvable = {
  approval_status: ApprovalStatus;
  approval_note: string;
  approved_by: string | null;
  approved_at: string | null;
};

export type CampaignRow = Stamped &
  Approvable & {
    id: string;
    name: string;
    type: string;
    objective: string;
    status: string;
    priority: string;
    description: string;
    notes: string;
    start_date: string | null;
    end_date: string | null;
    owner_id: string | null;
    products: string[];
    budget: number;
  };

export type ProjectRow = Stamped &
  Approvable & {
    id: string;
    name: string;
    campaign_id: string | null;
    requester_area: string;
    internal_client: string;
    owner_id: string | null;
    team_ids: string[];
    due_date: string | null;
    status: string;
    priority: string;
    description: string;
  };

export type TaskRow = Stamped & {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  due_date: string | null;
  campaign_id: string | null;
  project_id: string | null;
  event_id: string | null;
  labels: string[];
  position: number;
  completed_at: string | null;
};

export type CalendarEventRow = Stamped & {
  id: string;
  title: string;
  category: string;
  status: string;
  priority: string;
  event_date: string;
  start_time: string | null;
  duration_min: number | null;
  description: string;
  assignee_id: string | null;
  participant_ids: string[];
  agency: string;
  campaign_id: string | null;
  project_id: string | null;
  task_id: string | null;
};

export type ContentItemRow = Stamped & {
  id: string;
  title: string;
  category: string;
  status: string;
  description: string;
  body: string;
  tags: string[];
  campaign_id: string | null;
  project_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  review_note: string;
};

export type ContentVersionRow = {
  id: string;
  content_id: string;
  version_no: number;
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
};

export type ContentFavoriteRow = { user_id: string; content_id: string; created_at: string };

export type ChecklistItemRow = {
  id: string;
  module: string;
  record_id: string;
  group_label: string;
  text: string;
  done: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
};

export type RecordHistoryRow = {
  id: number;
  action: AuditLogRow["action"];
  changed_by: string | null;
  changed_at: string;
  old_data: Json | null;
  new_data: Json | null;
};


// ---------------------------------------------------------------- Fase 3 — Relacionamento e materiais
export type PartnerRow = Stamped & {
  id: string;
  company: string;
  category: string;
  status: string;
  city: string;
  contact_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  document: string;
  owner_id: string | null;
  counterparts: string;
  investment_month: number;
  expected_return: number;
  delivered_return: number;
  notes: string;
  rating: number | null;
};

export type ContractRow = Stamped &
  Approvable & {
    id: string;
    object: string;
    partner_id: string | null;
    company: string;
    category: string;
    status: string;
    value: number;
    cost_center: string;
    start_date: string | null;
    end_date: string | null;
    renewal_date: string | null;
    auto_renewal: boolean;
    owner_id: string | null;
    campaign_id: string | null;
    notes: string;
  };

export type EventRow = Stamped & {
  id: string;
  name: string;
  type: string;
  status: string;
  priority: string;
  event_date: string | null;
  end_date: string | null;
  start_time: string | null;
  city: string;
  venue: string;
  agency: string;
  assignee_id: string | null;
  team_ids: string[];
  partner_ids: string[];
  campaign_id: string | null;
  objective: string;
  description: string;
  budget: number;
  expected_audience: number | null;
  notes: string;
};

export type EventScheduleRow = { id: string; event_id: string; starts_at: string | null; title: string; owner_id: string | null; position: number; created_at: string };
export type EventAttendeeRow = {
  id: string; event_id: string; name: string; organization: string; role: string; email: string; phone: string;
  confirmed: boolean; checked_in: boolean; created_at: string;
};
export type EventSupplierRow = {
  id: string; event_id: string; partner_id: string | null; name: string; service: string; contact: string; value: number; created_at: string;
};

export type SponsorshipRow = Stamped & {
  id: string;
  event_name: string;
  institution: string;
  city: string;
  category: string;
  tier: string;
  status: string;
  value: number;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  partner_id: string | null;
  contract_id: string | null;
  event_id: string | null;
  campaign_id: string | null;
  materials_deadline: string | null;
  counterparts_deadline: string | null;
  accounting_deadline: string | null;
  report_summary: string;
  expected_return: number;
  delivered_return: number;
  notes: string;
};

export type OfflineMediaRow = Stamped & {
  id: string;
  title: string;
  categories: string[];
  status: string;
  city: string;
  location: string;
  supplier: string;
  partner_id: string | null;
  campaign_id: string | null;
  project_id: string | null;
  install_date: string | null;
  removal_date: string | null;
  owner_id: string | null;
  value: number;
  cost_center: string;
  notes: string;
};

export type InventoryItemRow = Stamped & {
  id: string;
  code: string;
  name: string;
  category: string;
  supplier: string;
  location: string;
  unit_value: number;
  min_quantity: number;
  quantity: number;
  reserved: number;
  notes: string;
};

export type InventoryMovementRow = {
  id: string;
  item_id: string;
  type: "Entrada" | "Saída" | "Reserva" | "Liberação" | "Inventário";
  quantity: number;
  delta: number;
  reason: string;
  destination: string;
  from_reserve: boolean;
  campaign_id: string | null;
  event_id: string | null;
  created_by: string | null;
  created_at: string;
};


// ---------------------------------------------------------------- Fase 4 — Financeiro
export type CostCenterRow = Stamped & { id: string; code: string; name: string; responsible_id: string | null; active: boolean };

export type BudgetLineRow = Stamped & {
  id: string; year: number; category: string; cost_center_id: string | null; planned: number; approved: number;
  approved_by: string | null; approved_at: string | null; notes: string;
};

export type PurchaseStatus = "Rascunho" | "Solicitado" | "Em aprovação" | "Aprovado" | "Comprado" | "Recebido" | "Concluído" | "Recusado" | "Cancelado";

export type PurchaseRequestRow = Stamped & {
  id: string; code: string; description: string; justification: string; requester_id: string | null; partner_id: string | null;
  cost_center_id: string | null; budget_category: string; campaign_id: string | null; project_id: string | null; event_id: string | null;
  estimated_value: number; final_value: number | null; urgency: string; needed_by: string | null; status: PurchaseStatus;
  decision_note: string; submitted_at: string | null; decided_at: string | null;
};

export type PurchaseApprovalRow = {
  id: string; request_id: string; level: "Gestor" | "Diretoria"; decision: "Aprovado" | "Recusado"; note: string;
  decided_by: string | null; decided_at: string;
};

export type InvoiceRow = Stamped & {
  id: string; number: string; partner_id: string | null; supplier_name: string; issue_date: string; due_date: string | null;
  value: number; expense_category: string; budget_category: string; cost_center_id: string | null; campaign_id: string | null;
  project_id: string | null; event_id: string | null; purchase_request_id: string | null; payment_method: string;
  status: "Pendente" | "Aprovada" | "Paga" | "Cancelada"; approved_by: string | null; approved_at: string | null; notes: string;
};

export type PaymentRow = Stamped & {
  id: string; description: string; invoice_id: string | null; partner_id: string | null; value: number; due_date: string;
  paid_at: string | null; method: string; status: "Agendado" | "Pago" | "Cancelado"; paid_by: string | null; notes: string;
};

export type ExpenseRow = Stamped & {
  id: string; description: string; expense_category: string; budget_category: string; cost_center_id: string | null;
  partner_id: string | null; campaign_id: string | null; project_id: string | null; event_id: string | null; invoice_id: string | null;
  payment_id: string | null; quantity: number; unit_value: number; total: number; expense_date: string; payment_method: string;
  owner_id: string | null; notes: string;
};

export type BudgetOverviewRow = { category: string; cost_center_id: string | null; planned: number; approved: number; committed: number; spent: number };

export type Database = {
  public: {
    Tables: {
      modules: Table<ModuleRow>;
      roles: Table<RoleRow, Partial<RoleRow> & Pick<RoleRow, "key" | "name">>;
      role_permissions: Table<
        RolePermissionRow,
        Partial<RolePermissionRow> & Pick<RolePermissionRow, "role_id" | "module">
      >;
      profiles: Table<ProfileRow, Partial<ProfileRow> & Pick<ProfileRow, "id" | "email">>;
      audit_log: Table<AuditLogRow>;
      attachments: Table<
        AttachmentRow,
        Partial<AttachmentRow> & Pick<AttachmentRow, "module" | "record_id" | "file_name" | "storage_path">
      >;
      comments: Table<CommentRow, Partial<CommentRow> & Pick<CommentRow, "module" | "record_id" | "body">>;
      app_settings: Table<AppSettingRow, Partial<AppSettingRow> & Pick<AppSettingRow, "key" | "value">>;
      module_tables: Table<{ table_name: string; module: string; title_column: string }>;
      campaigns: Table<CampaignRow, Partial<CampaignRow> & Pick<CampaignRow, "name">>;
      projects: Table<ProjectRow, Partial<ProjectRow> & Pick<ProjectRow, "name">>;
      tasks: Table<TaskRow, Partial<TaskRow> & Pick<TaskRow, "title">>;
      calendar_events: Table<CalendarEventRow, Partial<CalendarEventRow> & Pick<CalendarEventRow, "title" | "event_date">>;
      content_items: Table<ContentItemRow, Partial<ContentItemRow> & Pick<ContentItemRow, "title">>;
      content_versions: Table<ContentVersionRow>;
      content_favorites: Table<ContentFavoriteRow, Partial<ContentFavoriteRow> & Pick<ContentFavoriteRow, "content_id">>;
      checklist_items: Table<ChecklistItemRow, Partial<ChecklistItemRow> & Pick<ChecklistItemRow, "module" | "record_id" | "text">>;
      partners: Table<PartnerRow, Partial<PartnerRow> & Pick<PartnerRow, "company">>;
      contracts: Table<ContractRow, Partial<ContractRow> & Pick<ContractRow, "object">>;
      events: Table<EventRow, Partial<EventRow> & Pick<EventRow, "name">>;
      event_schedule: Table<EventScheduleRow, Partial<EventScheduleRow> & Pick<EventScheduleRow, "event_id" | "title">>;
      event_attendees: Table<EventAttendeeRow, Partial<EventAttendeeRow> & Pick<EventAttendeeRow, "event_id" | "name">>;
      event_suppliers: Table<EventSupplierRow, Partial<EventSupplierRow> & Pick<EventSupplierRow, "event_id" | "name">>;
      sponsorships: Table<SponsorshipRow, Partial<SponsorshipRow> & Pick<SponsorshipRow, "event_name">>;
      offline_media: Table<OfflineMediaRow, Partial<OfflineMediaRow> & Pick<OfflineMediaRow, "title">>;
      inventory_items: Table<InventoryItemRow, Partial<InventoryItemRow> & Pick<InventoryItemRow, "name">>;
      cost_centers: Table<CostCenterRow, Partial<CostCenterRow> & Pick<CostCenterRow, "code" | "name">>;
      budget_lines: Table<BudgetLineRow, Partial<BudgetLineRow> & Pick<BudgetLineRow, "year" | "category">>;
      purchase_requests: Table<PurchaseRequestRow, Partial<PurchaseRequestRow> & Pick<PurchaseRequestRow, "description">>;
      purchase_approvals: Table<PurchaseApprovalRow>;
      invoices: Table<InvoiceRow, Partial<InvoiceRow> & Pick<InvoiceRow, "number" | "value">>;
      payments: Table<PaymentRow, Partial<PaymentRow> & Pick<PaymentRow, "description" | "value" | "due_date">>;
      expenses: Table<ExpenseRow, Partial<Omit<ExpenseRow, "total">> & Pick<ExpenseRow, "description" | "unit_value">>;
      inventory_movements: Table<InventoryMovementRow, Partial<InventoryMovementRow> & Pick<InventoryMovementRow, "item_id" | "type" | "quantity">>;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_active_user: { Args: Record<string, never>; Returns: boolean };
      has_perm: { Args: { _module: string; _action: string }; Returns: boolean };
      my_permissions: { Args: Record<string, never>; Returns: MyPermissionRow[] };
      list_trash: { Args: Record<string, never>; Returns: TrashRow[] };
      restore_item: { Args: { _table: string; _id: string }; Returns: undefined };
      purge_item: { Args: { _table: string; _id: string }; Returns: undefined };
      purge_expired_trash: { Args: Record<string, never>; Returns: number };
      decide_approval: { Args: { _table: string; _id: string; _decision: string; _note?: string }; Returns: undefined };
      record_history: { Args: { _table: string; _id: string }; Returns: RecordHistoryRow[] };
      decide_purchase: { Args: { _id: string; _decision: string; _note?: string }; Returns: string };
      decide_invoice: { Args: { _id: string; _approve: boolean }; Returns: undefined };
      approve_budget_line: { Args: { _id: string; _amount: number }; Returns: undefined };
      budget_overview: { Args: { _year: number }; Returns: BudgetOverviewRow[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
