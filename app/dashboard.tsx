"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import TestLab from "./test-lab";
import AuthView, { type LoggedUser } from "./auth-view";
import UsersTab from "./users-tab";

type Row = Record<string, unknown>;
type DashboardData = {
  metrics: Row; orders: Row[]; purchaseOrders: Row[]; products: Row[];
  glassesInventory: Row[]; boxInventory: Row[]; lots: Row[]; movements: Row[]; customers: Row[]; defectiveProducts: Row[]; orderSources: Row[]; purchaseSources: Row[]; inventorySources: Row[];
};
type DashboardSlice = Partial<DashboardData> & { scope?: string; error?: string };
type SalesDashboardData = {
  filters: Row; summary: Row; monthly: Row[]; topGlasses: Row[]; topSources: Row[];
  sourceOptions: Row[]; glassesOptions: Row[]; coverage: Row; generatedAt: string; metricDefinition: string;
};
type SalesDashboardFilters = { fromDate:string; toDate:string; sources:string[]; glasses:string };
type OrderFilters = { customer:string; product:string; sources:string[]; fromDate:string; toDate:string; status:string };
type PurchaseFilters = { sources:string[]; fromDate:string; toDate:string };
type InventoryFilters = { product:string; sources:string[]; fromDate:string; toDate:string };
type PurchaseLine = { type: "FULL_BOX" | "GLASSES_ONLY" | "LOOSE_BOX"; sku: string; sourceSupplier: string; name: string; quantity: number; unitCost: number; boxSku: string; boxName: string };
type SalesLine = { type: "GLASSES_WITH_ATTACHED" | "GLASSES_ONLY" | "GLASSES_WITH_LOOSE" | "BOX_ONLY"; sku: string; name: string; boxSku: string; sourceSupplier: string; boxSourceSupplier: string; quantity: number; unitPrice: number };
type ShipPayer = "SELLER" | "RECIPIENT";

const EMPTY_DATA: DashboardData = { metrics: {}, orders: [], purchaseOrders: [], products: [], glassesInventory: [], boxInventory: [], lots: [], movements: [], customers: [], defectiveProducts: [], orderSources: [], purchaseSources: [], inventorySources: [] };
const EMPTY_SALES_DASHBOARD: SalesDashboardData = { filters:{}, summary:{}, monthly:[], topGlasses:[], topSources:[], sourceOptions:[], glassesOptions:[], coverage:{}, generatedAt:"", metricDefinition:"" };
const WORKFLOW: Record<string, string> = {
  DRAFT: "Nháp", WAITING_STOCK: "Chờ nhập hàng", DEPOSIT_RECEIVED: "Đã nhận cọc", ORDERING_SUPPLIER: "Đang đặt NCC",
  GOODS_RECEIVED: "Đã nhận hàng", READY_TO_SHIP: "Sẵn sàng giao", SHIPPING: "Đang giao",
  COMPLETED: "Hoàn tất", CANCELLED: "Đã hủy", RETURNED: "Đổi/trả hàng", REFUNDED: "Hoàn tiền",
};
const PURCHASE_STATUS: Record<string, string> = { DRAFT: "Nháp", ORDERED: "Đang đặt", PARTIAL: "Đã nhận một phần", RECEIVED: "Đã nhận đủ", CANCELLED: "Đã hủy", MERGED: "Đã gom" };
const LINE_LABEL: Record<string, string> = {
  FULL_BOX: "Kính full box", GLASSES_ONLY: "Chỉ kính", LOOSE_BOX: "Box nhập lẻ",
  FULL_BOX_GLASS: "Kính full box", ATTACHED_BOX: "Box kèm kính", GLASSES_WITH_ATTACHED: "Kính + box kèm",
  GLASSES_WITH_LOOSE: "Kính + box lẻ", BOX_ONLY: "Chỉ box",
};
const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE_RECEIPT: "Nhận hàng", ATTACHED_BOX_RECEIVED_PENDING: "Box kèm đã về, chờ kính",
  ATTACHED_BOX_ACTIVATED: "Ghép box với kính", RESERVE: "Giữ hàng", RELEASE: "Giải phóng giữ hàng",
  SALE: "Xuất bán", RETURN: "Hoàn kho do trả hàng", BOX_RELEASED_FROM_GLASSES: "Tách box khỏi kính",
  LOT_EDIT: "Sửa lô", STOCKTAKE: "Kiểm kê", DAMAGED: "Hỏng", LOST: "Mất", MANUAL: "Điều chỉnh",
  DEFECT_RECEIVED: "Nhận sản phẩm lỗi",
  PURCHASE_ORDER_CONSOLIDATED: "Gom đơn nháp",
};

function money(value: unknown) { return `${new Intl.NumberFormat("vi-VN").format(Number(value || 0))} ₫`; }
function qty(value: unknown) { return new Intl.NumberFormat("vi-VN").format(Number(value || 0)); }
function CurrencyInput({value,onChange,required=false}:{value:number;onChange:(value:number)=>void;required?:boolean}) {
  const [focused,setFocused]=useState(false);
  const numericValue=Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
  const displayValue=focused&&numericValue===0?"":new Intl.NumberFormat("vi-VN",{maximumFractionDigits:0}).format(numericValue);
  return <input
    type="text"
    inputMode="numeric"
    pattern="[0-9.]*"
    value={displayValue}
    required={required}
    onFocus={()=>setFocused(true)}
    onBlur={()=>setFocused(false)}
    onChange={(event)=>{
      const digits=event.target.value.replace(/\D/g,"").replace(/^0+(?=\d)/,"");
      onChange(digits?Number.parseInt(digits,10):0);
    }}
  />;
}
function dateValue(value: unknown) { return String(value || "").slice(0, 10); }
function todayValue() { return new Date().toISOString().slice(0, 10); }
function rows(value: unknown) { return Array.isArray(value) ? value as Row[] : []; }
function orderCustomerTotal(order: Row) { return Number(order.customer_total ?? Number(order.revenue||0)+(order.ship_payer==="RECIPIENT"?Number(order.ship||0):0)); }
function fullProductName(item: Row) {
  const name = String(item.name || "").trim(); const sku = String(item.sku || "").trim();
  if (!name) return sku || "Chưa có tên sản phẩm";
  const abbreviated = name.length <= 4 || (sku.length > name.length && sku.toLocaleUpperCase("vi-VN").startsWith(`${name.toLocaleUpperCase("vi-VN")} `));
  return abbreviated && sku ? sku : name;
}
function effectivePurchaseStatus(order: Row) { return String(order.merged_into_order_id || "") ? "MERGED" : String(order.status); }
function purchaseLinesFromOrder(order: Row): PurchaseLine[] {
  const items = rows(order.items);
  const result: PurchaseLine[] = [];
  const used = new Set<string>();
  for (const item of items) {
    if (used.has(String(item.id)) || item.fulfillment_type === "ATTACHED_BOX") continue;
    if (item.fulfillment_type === "FULL_BOX_GLASS") {
      const box = items.find((candidate) => candidate.fulfillment_type === "ATTACHED_BOX" && candidate.link_group_id === item.link_group_id);
      if (box) used.add(String(box.id));
      result.push({ type: "FULL_BOX", sku: String(item.sku), sourceSupplier: String(item.source_supplier || order.supplier || ""), name: String(item.name), quantity: Number(item.ordered_qty), unitCost: Number(item.unit_cost), boxSku: String(box?.sku || ""), boxName: String(box?.name || "") });
    } else if (item.fulfillment_type === "LOOSE_BOX") {
      result.push({ type: "LOOSE_BOX", sku: String(item.sku), sourceSupplier: String(item.source_supplier || order.supplier || ""), name: String(item.name), quantity: Number(item.ordered_qty), unitCost: Number(item.unit_cost), boxSku: "", boxName: "" });
    } else {
      result.push({ type: "GLASSES_ONLY", sku: String(item.sku), sourceSupplier: String(item.source_supplier || order.supplier || ""), name: String(item.name), quantity: Number(item.ordered_qty), unitCost: Number(item.unit_cost), boxSku: "", boxName: "" });
    }
    used.add(String(item.id));
  }
  return result;
}

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState<LoggedUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [orderFilters, setOrderFilters] = useState<OrderFilters>({ customer: "", product: "", sources: [], fromDate: "", toDate: "", status: "" });
  const [inventoryKind, setInventoryKind] = useState<"GLASSES"|"BOX">("GLASSES");
  const [inventoryFilters, setInventoryFilters] = useState<InventoryFilters>({product:"",sources:[],fromDate:"",toDate:""});
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [purchaseFilters, setPurchaseFilters] = useState<PurchaseFilters>({sources:[],fromDate:"",toDate:""});
  const [productSearch, setProductSearch] = useState("");
  const [productKind, setProductKind] = useState<"GLASSES" | "BOX">("GLASSES");
  const [defectSearch, setDefectSearch] = useState("");
  const [defectKind, setDefectKind] = useState<"GLASSES" | "BOX">("GLASSES");
  const [salesDashboard, setSalesDashboard] = useState<SalesDashboardData>(EMPTY_SALES_DASHBOARD);
  const [salesDashboardFilters, setSalesDashboardFilters] = useState<SalesDashboardFilters>({fromDate:"2026-01-01",toDate:todayValue(),sources:[],glasses:""});
  const [salesDashboardLoading, setSalesDashboardLoading] = useState(false);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([{ type: "FULL_BOX", sku: "", sourceSupplier: "", name: "", quantity: 1, unitCost: 0, boxSku: "", boxName: "" }]);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [salesLines, setSalesLines] = useState<SalesLine[]>([{ type: "GLASSES_WITH_ATTACHED", sku: "", name: "", boxSku: "", sourceSupplier: "", boxSourceSupplier: "", quantity: 1, unitPrice: 0 }]);
  const [salesWorkflow, setSalesWorkflow] = useState("DEPOSIT_RECEIVED");
  const [salesShipPayer, setSalesShipPayer] = useState<ShipPayer>("SELLER");
  const [salesShip, setSalesShip] = useState(0);
  const tabRef = useRef("overview");
  const pageRequests = useRef(new Map<string, AbortController>());
  const salesDashboardRequest = useRef<AbortController | null>(null);
  const pendingRequests = useRef(0);
  const formOptionsReady = useRef(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json() as Promise<{ user?: LoggedUser | null }>)
      .then((resData) => {
        setCurrentUser(resData.user || null);
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthChecking(false));
  }, []);

  const setRequestPending = useCallback((delta:number) => {
    pendingRequests.current = Math.max(0, pendingRequests.current + delta);
    setLoading(pendingRequests.current > 0);
  }, []);

  const loadPage = useCallback(async (scope:string, filters:OrderFilters, stockFilters:InventoryFilters) => {
    if (["analytics", "users", "test-lab", "manual"].includes(scope)) return true;
    pageRequests.current.get(scope)?.abort();
    const controller = new AbortController();
    pageRequests.current.set(scope, controller);
    setRequestPending(1);
    try {
      const query = new URLSearchParams();
      query.set("scope", scope);
      for (const [key,item] of Object.entries(filters)) {
        if (key === "sources") for (const source of item as string[]) query.append("source",source);
        else if (item) query.set(key,String(item));
      }
      if (stockFilters.product) query.set("inventoryProduct",stockFilters.product);
      for (const source of stockFilters.sources) query.append("inventorySource",source);
      if (stockFilters.fromDate) query.set("inventoryFromDate",stockFilters.fromDate);
      if (stockFilters.toDate) query.set("inventoryToDate",stockFilters.toDate);
      const response = await fetch(`/api/v2/dashboard?${query}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json() as DashboardSlice;
      if (!response.ok) throw new Error(result.error || "Không thể tải dữ liệu.");
      setData((current) => ({ ...current, ...result }));
      if (["sales", "purchases", "form-options"].includes(scope)) formOptionsReady.current = true;
      setError("");
      return true;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return false;
      setError(caught instanceof Error ? caught.message : "Không thể tải dữ liệu.");
      return false;
    } finally {
      if (pageRequests.current.get(scope) === controller) pageRequests.current.delete(scope);
      setRequestPending(-1);
    }
  }, [setRequestPending]);

  const load = useCallback((filters:OrderFilters = orderFilters, stockFilters:InventoryFilters = inventoryFilters) => (
    loadPage(tabRef.current, filters, stockFilters)
  ), [inventoryFilters, loadPage, orderFilters]);

  const loadSalesDashboard = useCallback(async (filters:SalesDashboardFilters) => {
    salesDashboardRequest.current?.abort();
    const controller = new AbortController();
    salesDashboardRequest.current = controller;
    setSalesDashboardLoading(true);
    try {
      const query = new URLSearchParams();
      for (const [key,item] of Object.entries(filters)) {
        if (key === "sources") for (const source of item as string[]) query.append("source",source);
        else if (item) query.set(key,String(item));
      }
      const response = await fetch(`/api/v2/sales-dashboard?${query}`, { cache:"no-store", signal: controller.signal });
      const result = await response.json() as SalesDashboardData & { error?:string };
      if (!response.ok) throw new Error(result.error || "Không thể tải dashboard bán hàng.");
      setSalesDashboard(result); setError("");
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Không thể tải dashboard bán hàng.");
    } finally {
      if (salesDashboardRequest.current === controller) {
        salesDashboardRequest.current = null;
        setSalesDashboardLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    setError("");
    const requests = pageRequests.current;
    const hashTab = window.location.hash.replace("#", "");
    const initialTab = ["overview","analytics","sales","purchases","inventory","products","defects","customers","activity","users","test-lab","manual"].includes(hashTab) ? hashTab : "overview";
    tabRef.current = initialTab;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the view from the URL hash
    if (initialTab !== "overview") setTab(initialTab);
    if (initialTab === "analytics") void loadSalesDashboard(salesDashboardFilters);
    else void loadPage(initialTab, orderFilters, inventoryFilters);
    return () => {
      for (const controller of requests.values()) controller.abort();
      salesDashboardRequest.current?.abort();
    };
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeTab(next: string) {
    const previous = tabRef.current;
    tabRef.current = next;
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
    if (previous !== next) pageRequests.current.get(previous)?.abort();
    if (next === "analytics") void loadSalesDashboard(salesDashboardFilters);
    else {
      salesDashboardRequest.current?.abort();
      void loadPage(next, orderFilters, inventoryFilters);
    }
  }
  async function action(name: string, input: Row, success = "Đã lưu thay đổi.") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v2/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, input }) });
      const result = await response.json() as Row & { error?: string };
      if (!response.ok) throw new Error(result.error || "Không thể thực hiện thao tác.");
      formOptionsReady.current = false;
      setNotice(success); setModal(null); setSelected(null);
      if (tabRef.current === "analytics") await loadSalesDashboard(salesDashboardFilters);
      else await load();
      window.setTimeout(() => setNotice(""), 4000); return result;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không thể thực hiện thao tác."); return null; }
    finally { setBusy(false); }
  }
  function form(event: FormEvent<HTMLFormElement>) { return new FormData(event.currentTarget); }
  function value(fd: FormData, name: string) { return String(fd.get(name) || ""); }
  function number(fd: FormData, name: string) { return Number(fd.get(name) || 0); }
  async function ensureFormOptions() {
    if (formOptionsReady.current) return true;
    return loadPage("form-options", orderFilters, inventoryFilters);
  }
  async function openPurchase() {
    if (!await ensureFormOptions()) return;
    setPurchaseLines([{ type: "FULL_BOX", sku: "", sourceSupplier: "", name: "", quantity: 1, unitCost: 0, boxSku: "", boxName: "" }]);
    setSelected(null); setModal("purchase"); setError("");
  }
  async function openPurchaseEdit(order:Row) {
    if (!await ensureFormOptions()) return;
    setSelected(order); setPurchaseLines(purchaseLinesFromOrder(order)); setModal("purchase-edit");
  }
  async function openSales(order?: Row) {
    if (!await ensureFormOptions()) return;
    if (order) {
      setSelected(order); setSalesLines(rows(order.items).map((item) => ({ type: String(item.line_type) as SalesLine["type"], sku: String(item.sku || ""), name: String(item.name || ""), boxSku: String(item.box_sku || ""), sourceSupplier: String(item.source_supplier || order.source_supplier || ""), boxSourceSupplier: String(item.box_source_supplier || ""), quantity: Number(item.quantity || 1), unitPrice: Number(item.unit_price || 0) })));
      setSalesWorkflow(["DRAFT","WAITING_STOCK","DEPOSIT_RECEIVED","ORDERING_SUPPLIER","GOODS_RECEIVED","READY_TO_SHIP","SHIPPING"].includes(String(order.workflow_status)) ? String(order.workflow_status) : "DEPOSIT_RECEIVED");
      setSalesShipPayer(order.ship_payer === "RECIPIENT" ? "RECIPIENT" : "SELLER"); setSalesShip(Number(order.ship || 0));
    } else {
      setSelected(null); setSalesLines([{ type: "GLASSES_WITH_ATTACHED", sku: "", name: "", boxSku: "", sourceSupplier: "", boxSourceSupplier: "", quantity: 1, unitPrice: 0 }]);
      setSalesWorkflow("DEPOSIT_RECEIVED"); setSalesShipPayer("SELLER"); setSalesShip(0);
    }
    setModal("sales"); setError("");
  }
  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fd = form(event);
    await action("create_purchase_order", { orderDate: value(fd,"orderDate"), status: value(fd,"status"), shipCost: number(fd,"shipCost"), deposit: number(fd,"deposit"), paymentMethod: value(fd,"paymentMethod"), note: value(fd,"note"), lines: purchaseLines }, "Đã tạo đơn nhập. Hàng chỉ vào kho sau khi bạn bấm Nhận hàng.");
  }
  async function submitConsolidation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fd = form(event);
    const result = await action("consolidate_purchase_orders", { purchaseOrderIds:selectedDraftIds, orderDate:value(fd,"orderDate"), shipCost:number(fd,"shipCost"), deposit:number(fd,"deposit"), paymentMethod:value(fd,"paymentMethod"), note:value(fd,"note") }, "Đã gom các đơn nháp thành một đơn đặt hàng tổng.");
    if (result) setSelectedDraftIds([]);
  }
  async function submitSales(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fd = form(event);
    await action(selected ? "update_sales_order" : "create_sales_order", { id: selected?.id, orderDate: value(fd,"orderDate"), customer: value(fd,"customer"), phone: value(fd,"phone"), address: value(fd,"address"), status: value(fd,"status"), deposit: number(fd,"deposit"), paymentMethod: value(fd,"paymentMethod"), ship: salesShip, shipPayer: salesShipPayer, carrier: value(fd,"carrier"), note: value(fd,"note"), lines: salesLines }, selected ? "Đã cập nhật nguồn từng dòng, phí ship và phần giữ kho." : "Đã tạo đơn hàng.");
  }

  const filteredPurchases = useMemo(() => data.purchaseOrders.filter((order) => {
    const query = purchaseSearch.trim().toLocaleLowerCase("vi-VN");
    const glassesText = rows(order.items).filter((item)=>item.kind === "GLASSES").map((item)=>`${item.sku} ${item.name}`).join(" ");
    if (query && !`${order.code} ${glassesText}`.toLocaleLowerCase("vi-VN").includes(query)) return false;
    const sources = rows(order.items).map((item)=>String(item.source_supplier||order.supplier||"").trim()).filter(Boolean);
    if (purchaseFilters.sources.length && !purchaseFilters.sources.some((source)=>sources.includes(source))) return false;
    const orderDate = dateValue(order.order_date);
    if (purchaseFilters.fromDate && orderDate < purchaseFilters.fromDate) return false;
    if (purchaseFilters.toDate && orderDate > purchaseFilters.toDate) return false;
    return true;
  }), [data.purchaseOrders, purchaseFilters, purchaseSearch]);
  const selectedDraftOrders = data.purchaseOrders.filter((order)=>selectedDraftIds.includes(String(order.id)) && effectivePurchaseStatus(order)==="DRAFT");
  const selectableDraftIds = filteredPurchases.filter((order)=>effectivePurchaseStatus(order)==="DRAFT").map((order)=>String(order.id));
  const selectedDraftItems = selectedDraftOrders.flatMap((order)=>rows(order.items).filter((item)=>item.fulfillment_type!=="ATTACHED_BOX"));
  const selectedDraftSources = Array.from(new Set(selectedDraftOrders.flatMap((order)=>rows(order.items).map((item)=>String(item.source_supplier||order.supplier||"").trim())).filter(Boolean)));
  const filteredProducts = useMemo(() => data.products.filter((product) => product.kind === productKind && `${product.sku} ${product.name} ${product.brand} ${product.model} ${product.color} ${product.source_supplier}`.toLocaleLowerCase("vi-VN").includes(productSearch.toLocaleLowerCase("vi-VN"))), [data.products, productKind, productSearch]);
  const filteredDefects = useMemo(() => data.defectiveProducts.filter((item) => item.kind === defectKind && `${item.sku} ${item.name} ${item.supplier} ${item.purchase_order_code} ${item.receipt_code} ${item.defect_reason}`.toLocaleLowerCase("vi-VN").includes(defectSearch.toLocaleLowerCase("vi-VN"))), [data.defectiveProducts, defectKind, defectSearch]);
  const inventoryLots = useMemo(() => data.lots.filter((item)=>item.kind===inventoryKind), [data.lots,inventoryKind]);
  const m = data.metrics; const glassesAvailable = Number(m.glasses_on_hand || 0) - Number(m.glasses_reserved || 0); const boxesAvailable = Number(m.boxes_on_hand || 0) - Number(m.boxes_reserved || 0);
  const salesRevenue = salesLines.reduce((sum,line)=>sum+Number(line.quantity||0)*Number(line.unitPrice||0),0);
  const salesCustomerTotal = salesRevenue + (salesShipPayer === "RECIPIENT" ? salesShip : 0);

  if (authChecking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c1424", color: "#f5c866" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "48px", height: "48px", margin: "0 auto 16px", border: "2px solid #f5c866", borderRadius: "14px", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "18px" }}>OR</div>
          <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>Đang kiểm tra bảo mật phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthView
        onSuccess={(user) => {
          setError("");
          setCurrentUser(user);
        }}
      />
    );
  }

  return <div className="app-shell v2-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">OR</div><div><strong>ORD Studio</strong><span>Order & Stock OS</span></div></div>
      <nav aria-label="Điều hướng chính">{[["overview","⌂","Tổng quan"],["analytics","▥","Dashboard bán"],["sales","▤","Đơn bán"],["purchases","↓","Đơn nhập"],["inventory","◇","Kiểm soát kho"],["products","□","Sản phẩm"],["defects","!","Sản phẩm lỗi"],["customers","♙","Khách hàng"],["activity","↻","Nhật ký kho"],["users","🛡","Quản lý User"],["test-lab","T","Khu vực test"],["manual","?","Hướng dẫn"]].map(([id,icon,label]) => <button key={id} type="button" className={`nav-item nav-button ${tab === id ? "active" : ""}`} onClick={() => changeTab(id)}><span>{icon}</span>{label}</button>)}</nav>
      
      {/* Logged in user profile & logout */}
      <div className="sidebar-profile-box">
        <div className="sidebar-profile-row">
          <div className="sidebar-avatar-bubble">{currentUser.email.slice(0, 2).toUpperCase()}</div>
          <div className="sidebar-user-text">
            <strong title={currentUser.email}>{currentUser.email}</strong>
            <span className={`user-role-tag ${currentUser.role.toLowerCase()}`}>
              {currentUser.role === "ADMIN" ? "★ Quản trị viên" : "Nhân viên"}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-logout-btn"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            setCurrentUser(null);
            setError("");
          }}
        >
          Đăng xuất ⎋
        </button>
      </div>

      <div className="sidebar-note"><span className="dot" /><div><strong>{loading||salesDashboardLoading ? "Đang đồng bộ" : "Database đã đồng bộ"}</strong><p>Tài khoản riêng · dữ liệu máy chủ</p></div></div>
    </aside>
    <main className="workspace"><header className="topbar"><div><p className="eyebrow">ORD STUDIO · 2026</p><h1>{tab === "overview" ? "Trung tâm vận hành" : tab === "analytics" ? "Dashboard bán hàng" : tab === "sales" ? "Đơn hàng khách" : tab === "purchases" ? "Đơn nhập hàng" : tab === "inventory" ? "Kiểm soát kho" : tab === "products" ? "Danh mục sản phẩm" : tab === "defects" ? "Sản phẩm lỗi" : tab === "customers" ? "Khách hàng" : tab === "activity" ? "Lịch sử biến động kho" : tab === "users" ? "Quản lý Người dùng & Phân quyền" : tab === "test-lab" ? "Khu vực test nhập – bán" : "Hướng dẫn sử dụng"}</h1></div>{tab === "test-lab" ? <div className="test-header-flag"><strong>TEST</strong><span>Tách biệt dữ liệu thật</span></div> : <div className="top-actions"><button className="icon-button" onClick={() => tab === "analytics" ? void loadSalesDashboard(salesDashboardFilters) : void load()} aria-label="Làm mới">↻</button><button className="button secondary" onClick={openPurchase}>+ Đơn nhập</button><button className="button primary" onClick={() => openSales()}>+ Đơn bán</button></div>}</header>
      <div className="content">{notice && <div className="notice success-notice">{notice}</div>}{error && <div className="notice error-notice">{error}</div>}
        {tab === "overview" && <><section className="hero-card"><div><p className="eyebrow light">TỒN KHO CÓ THỂ BÁN</p><h2>{glassesAvailable} kính và {boxesAvailable} box đang sẵn sàng.</h2><p>Tồn thực tế được tách riêng với số đang giữ cho khách. Box nhập lẻ chỉ tăng kho khi bạn xác nhận đã nhận; box full-box về trước vẫn chờ kính.</p></div><div className="hero-stats"><div><strong>{String(m.open_purchase_orders || 0)}</strong><span>đơn nhập đang mở</span></div><div><strong>{String(m.active_sales_orders || 0)}</strong><span>đơn khách đang xử lý</span></div></div></section><section className="metrics v2-metrics"><Metric icon="◇" tone="blue" label="Kính thực tế" value={qty(m.glasses_on_hand)} note={`Đang giữ ${qty(m.glasses_reserved)}`} /><Metric icon="✓" tone="green" label="Kính có thể bán" value={qty(glassesAvailable)} note="Thực tế − đang giữ" /><Metric icon="□" tone="amber" label="Box thực tế" value={qty(m.boxes_on_hand)} note={`Đang giữ ${qty(m.boxes_reserved)}`} /><Metric icon="▤" tone="violet" label="Đơn đang xử lý" value={qty(m.active_sales_orders)} note="Chờ nhập hàng đến đang giao" /><Metric icon="₫" tone="green" label="Lãi tháng này" value={money(m.monthly_profit)} note={`${qty(m.customers)} khách hàng`} /></section><div className="two-column"><section className="panel orders-panel"><PanelTitle eyebrow="CẦN XỬ LÝ" title="Đơn nhập chưa nhận đủ" action="Xem tất cả →" onAction={() => changeTab("purchases")} /><PurchaseTable orders={data.purchaseOrders.filter((order) => ["DRAFT","ORDERED","PARTIAL"].includes(String(order.status)))} onOpen={(order) => { setSelected(order); setModal("purchase-detail"); }} compact /></section><section className="panel quick-panel"><PanelTitle eyebrow="LUỒNG LÀM VIỆC" title="Thao tác nhanh" /><button className="quick-action" onClick={openPurchase}><span className="quick-symbol">DN</span><div><strong>Tạo đơn nhập hàng</strong><small>Nhiều kính và box trong một đơn</small></div><b>→</b></button><button className="quick-action" onClick={() => openSales()}><span className="quick-symbol">DH</span><div><strong>Tạo đơn khách</strong><small>Chọn chờ nhập hoặc giữ kính có sẵn</small></div><b>→</b></button><button className="quick-action" onClick={() => changeTab("inventory")}><span className="quick-symbol">KK</span><div><strong>Kiểm kê kho</strong><small>Sửa lô, tăng/giảm, mất/hỏng</small></div><b>→</b></button></section></div><section className="panel orders-panel"><PanelTitle eyebrow="ĐƠN BÁN GẦN NHẤT" title="Theo dõi xử lý, nguồn và lãi" action="Xem tất cả →" onAction={() => changeTab("sales")} /><SalesTable orders={data.orders} defaultPageSize={8} onOpen={(order) => { setSelected(order); setModal("sales-detail"); }} /></section></>}
        {tab === "analytics" && <SalesAnalyticsDashboard data={salesDashboard} filters={salesDashboardFilters} setFilters={setSalesDashboardFilters} loading={salesDashboardLoading} onApply={() => void loadSalesDashboard(salesDashboardFilters)} onReset={() => {const reset:SalesDashboardFilters={fromDate:"2026-01-01",toDate:todayValue(),sources:[],glasses:""};setSalesDashboardFilters(reset);void loadSalesDashboard(reset);}} />}
        {tab === "purchases" && <section className="panel orders-panel page-panel"><PanelTitle eyebrow="NHẬP HÀNG · TOÀN BỘ LỊCH SỬ" title="Đơn nháp, đơn đã gom và đơn đang nhận" action="+ Tạo đơn nhập" onAction={openPurchase} /><div className="purchase-status-summary"><span><b>{data.purchaseOrders.length}</b> Tất cả</span><span><b>{data.purchaseOrders.filter((order)=>order.status==="DRAFT").length}</b> Nháp chờ gom</span><span><b>{data.purchaseOrders.filter((order)=>["ORDERED","PARTIAL"].includes(String(order.status))).length}</b> Đang đặt</span><span><b>{data.purchaseOrders.filter((order)=>order.status==="RECEIVED").length}</b> Đã nhận đủ</span><span><b>{data.purchaseOrders.filter((order)=>order.status==="MERGED").length}</b> Đã gom</span></div><form className="order-filters purchase-filters" onSubmit={(event)=>event.preventDefault()}><div className="filter-grid purchase-filter-grid"><label>Mã đơn / tên kính<input placeholder="Nhập mã đơn, tên hoặc SKU kính" value={purchaseSearch} onChange={(event)=>setPurchaseSearch(event.target.value)} /></label><SourceCheckboxes options={data.purchaseSources.map((item)=>String(item.supplier))} values={purchaseFilters.sources} onChange={(sources)=>setPurchaseFilters({...purchaseFilters,sources})} /><label>Từ ngày<input type="date" min="2026-01-01" value={purchaseFilters.fromDate} onChange={(event)=>setPurchaseFilters({...purchaseFilters,fromDate:event.target.value})} /></label><label>Đến ngày<input type="date" min="2026-01-01" value={purchaseFilters.toDate} onChange={(event)=>setPurchaseFilters({...purchaseFilters,toDate:event.target.value})} /></label></div><div className="filter-actions"><span>{filteredPurchases.length} / {data.purchaseOrders.length} đơn nhập</span><button type="button" className="button secondary" onClick={()=>{setPurchaseSearch("");setPurchaseFilters({sources:[],fromDate:"",toDate:""});}}>Xóa lọc</button></div></form><div className="purchase-batch-toolbar"><div><strong>Gom đơn nháp để đặt một lần</strong><span>Tick từ 2 đơn nháp; nguồn của từng dòng vẫn được giữ nguyên.</span></div><div><button type="button" className="button secondary" disabled={!selectableDraftIds.length} onClick={()=>setSelectedDraftIds(selectedDraftIds.length===selectableDraftIds.length?[]:selectableDraftIds)}>{selectableDraftIds.length>0&&selectedDraftIds.length===selectableDraftIds.length?"Bỏ chọn tất cả":"Chọn tất cả nháp"}</button><button type="button" className="button primary" disabled={selectedDraftOrders.length<2} onClick={()=>setModal("purchase-consolidate")}>Gom {selectedDraftOrders.length} đơn thành đơn đặt</button></div></div><PurchaseTable orders={filteredPurchases} onOpen={(order) => { setSelected(order); setModal("purchase-detail"); }} selectedIds={selectedDraftIds} onToggle={(id)=>setSelectedDraftIds((current)=>current.includes(id)?current.filter((item)=>item!==id):[...current,id])} /></section>}
        {tab === "sales" && <section className="panel orders-panel page-panel"><PanelTitle eyebrow="ĐƠN KHÁCH" title="Nhiều sản phẩm, nguồn nhập, lãi, thanh toán và vận chuyển" action="+ Tạo đơn bán" onAction={() => openSales()} /><form className="order-filters" onSubmit={(event) => { event.preventDefault(); void load(orderFilters); }}><div className="filter-grid sales-filter-grid"><label>Tên khách / điện thoại<input value={orderFilters.customer} onChange={(event) => setOrderFilters({...orderFilters,customer:event.target.value})} /></label><label>Tên kính / box<input value={orderFilters.product} onChange={(event) => setOrderFilters({...orderFilters,product:event.target.value})} /></label><SourceCheckboxes options={data.orderSources.map((item)=>String(item.source_supplier))} values={orderFilters.sources} onChange={(sources)=>setOrderFilters({...orderFilters,sources})} includeUnspecified /><label>Từ ngày<input type="date" min="2026-01-01" value={orderFilters.fromDate} onChange={(event) => setOrderFilters({...orderFilters,fromDate:event.target.value})} /></label><label>Đến ngày<input type="date" min="2026-01-01" value={orderFilters.toDate} onChange={(event) => setOrderFilters({...orderFilters,toDate:event.target.value})} /></label><label>Trạng thái<select value={orderFilters.status} onChange={(event) => setOrderFilters({...orderFilters,status:event.target.value})}><option value="">Tất cả</option>{Object.entries(WORKFLOW).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label></div><div className="filter-actions"><button type="button" className="button secondary" onClick={() => { const empty:OrderFilters={customer:"",product:"",sources:[],fromDate:"",toDate:"",status:""}; setOrderFilters(empty); void load(empty); }}>Xóa lọc</button><button className="button primary">Tìm đơn</button></div></form><SalesTable orders={data.orders} onOpen={(order) => { setSelected(order); setModal("sales-detail"); }} /></section>}
        {tab === "inventory" && <>
          <section className="metrics inventory-summary">
            <Metric icon="◇" tone="blue" label="Kính thực tế" value={qty(m.glasses_on_hand)} note={`Giữ ${qty(m.glasses_reserved)} · Bán được ${qty(glassesAvailable)}`} />
            <Metric icon="□" tone="amber" label="Box thực tế" value={qty(m.boxes_on_hand)} note={`Giữ ${qty(m.boxes_reserved)} · Bán được ${qty(boxesAvailable)}`} />
            <Metric icon="↓" tone="violet" label="Đơn nhập mở" value={qty(m.open_purchase_orders)} note="Box/kính chưa nhận đủ" />
            <Metric icon="↻" tone="green" label="Nhật ký" value={qty(data.movements.length)} note="Biến động gần nhất" />
          </section>
          <section className="panel inventory-control page-panel">
            <PanelTitle eyebrow="TỒN KHO" title="Tồn thực tế − Đang giữ = Có thể bán" />
            <div className="product-kind-tabs inventory-kind-tabs" role="tablist" aria-label="Loại kho">
              <button type="button" role="tab" aria-selected={inventoryKind === "GLASSES"} className={inventoryKind === "GLASSES" ? "active" : ""} onClick={() => setInventoryKind("GLASSES")}>
                <span>◇</span><div><strong>Kho kính</strong><small>Tồn kính theo mẫu và nguồn</small></div><b>{qty(data.glassesInventory.reduce((sum,item)=>sum+Number(item.on_hand||0),0))}</b>
              </button>
              <button type="button" role="tab" aria-selected={inventoryKind === "BOX"} className={inventoryKind === "BOX" ? "active" : ""} onClick={() => setInventoryKind("BOX")}>
                <span>□</span><div><strong>Kho box</strong><small>Box lẻ, box kèm kính và box chờ kính</small></div><b>{qty(data.boxInventory.reduce((sum,item)=>sum+Number(item.loose_qty||0)+Number(item.attached_qty||0),0))}</b>
              </button>
            </div>
            <form className="order-filters inventory-filters" onSubmit={(event) => {event.preventDefault();void load(orderFilters,inventoryFilters);}}>
              <div className="filter-grid inventory-filter-grid">
                <label>{inventoryKind === "GLASSES" ? "Tên kính / SKU" : "Tên box / SKU"}<input placeholder={inventoryKind === "GLASSES" ? "Nhập tên hoặc mã kính" : "Nhập tên hoặc mã box"} value={inventoryFilters.product} onChange={(event)=>setInventoryFilters({...inventoryFilters,product:event.target.value})} /></label>
                <SourceCheckboxes options={data.inventorySources.map((item)=>String(item.supplier))} values={inventoryFilters.sources} onChange={(sources)=>setInventoryFilters({...inventoryFilters,sources})} />
                <label>Từ ngày nhập<input type="date" value={inventoryFilters.fromDate} onChange={(event)=>setInventoryFilters({...inventoryFilters,fromDate:event.target.value})} /></label>
                <label>Đến ngày nhập<input type="date" value={inventoryFilters.toDate} onChange={(event)=>setInventoryFilters({...inventoryFilters,toDate:event.target.value})} /></label>
              </div>
              <div className="filter-actions">
                <span>{inventoryKind === "GLASSES" ? `${data.glassesInventory.length} mẫu kính` : `${data.boxInventory.length} loại box`} phù hợp</span>
                <button type="button" className="button secondary" onClick={()=>{const empty:InventoryFilters={product:"",sources:[],fromDate:"",toDate:""};setInventoryFilters(empty);void load(orderFilters,empty);}}>Xóa lọc</button>
                <button className="button primary">Áp dụng</button>
              </div>
            </form>
            {inventoryKind === "BOX" && <p className="section-note inventory-filter-note">Box kèm đã về nhưng đang chờ kính tốt không được tính vào “Thực tế” hoặc “Có thể bán”.</p>}
            <div className="split-inventory"><InventoryTable title={inventoryKind === "GLASSES" ? "Kho kính" : "Kho box"} rows={inventoryKind === "GLASSES" ? data.glassesInventory : data.boxInventory} kind={inventoryKind} /></div>
          </section>
          <section className="panel orders-panel">
            <PanelTitle eyebrow="LÔ NHẬP ĐÃ NHẬN" title={inventoryKind === "GLASSES" ? "Lô kính · sửa và kiểm kê thực tế" : "Lô box · sửa và kiểm kê thực tế"} />
            <LotsTable lots={inventoryLots} inventoryKind={inventoryKind} onEdit={(lot) => {setSelected(lot);setModal("lot");}} />
          </section>
        </>}
        {tab === "products" && <section className="panel orders-panel page-panel"><PanelTitle eyebrow="DANH MỤC CHUẨN" title="Quản lý riêng danh mục kính và danh mục box" action={`+ Thêm ${productKind === "GLASSES" ? "kính" : "box"}`} onAction={() => {setSelected({kind:productKind});setModal("product");}} /><div className="product-kind-tabs" role="tablist" aria-label="Loại sản phẩm"><button type="button" role="tab" aria-selected={productKind === "GLASSES"} className={productKind === "GLASSES" ? "active" : ""} onClick={() => {setProductKind("GLASSES");setProductSearch("");}}><span>◇</span><div><strong>Kính</strong><small>Thương hiệu · model · màu</small></div><b>{data.products.filter((product) => product.kind === "GLASSES").length}</b></button><button type="button" role="tab" aria-selected={productKind === "BOX"} className={productKind === "BOX" ? "active" : ""} onClick={() => {setProductKind("BOX");setProductSearch("");}}><span>□</span><div><strong>Box</strong><small>Loại hộp · nguồn nhập</small></div><b>{data.products.filter((product) => product.kind === "BOX").length}</b></button></div><div className="simple-toolbar"><input placeholder={productKind === "GLASSES" ? "Tìm tên kính, thương hiệu, model, màu hoặc SKU…" : "Tìm tên box, nguồn nhập hoặc SKU…"} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /><span>{filteredProducts.length} {productKind === "GLASSES" ? "kính" : "box"}</span></div><div className="product-section-title"><span className={productKind === "GLASSES" ? "glasses" : "box"}>{productKind === "GLASSES" ? "◇" : "□"}</span><div><h3>Danh mục {productKind === "GLASSES" ? "kính" : "box"}</h3><p>{productKind === "GLASSES" ? "Mã kính, thương hiệu, model, màu và loại box phù hợp." : "Mã box, tên hộp, nguồn nhập và tình trạng tồn kho."}</p></div></div><ProductsTable products={filteredProducts} productKind={productKind} onEdit={(product) => {setSelected(product);setModal("product");}} /></section>}
        {tab === "defects" && <section className="panel orders-panel page-panel"><PanelTitle eyebrow="KIỂM SOÁT HÀNG LỖI" title="Sản phẩm lỗi được tách khỏi kho có thể bán" /><div className="defect-rule"><span>!</span><div><strong>Hàng lỗi không được cộng vào tồn kho bán hàng</strong><p>Kính hoặc box lỗi được ghi nhận theo từng phiếu nhận, kèm nguồn, giá vốn và lý do lỗi để dễ đối soát.</p></div></div><div className="product-kind-tabs defect-kind-tabs" role="tablist" aria-label="Loại sản phẩm lỗi"><button type="button" role="tab" aria-selected={defectKind === "GLASSES"} className={defectKind === "GLASSES" ? "active" : ""} onClick={() => {setDefectKind("GLASSES");setDefectSearch("");}}><span>◇</span><div><strong>Kính lỗi</strong><small>Kính móp, trầy, gãy hoặc sai mẫu</small></div><b>{data.defectiveProducts.filter((item) => item.kind === "GLASSES").reduce((sum,item) => sum+Number(item.quantity||0),0)}</b></button><button type="button" role="tab" aria-selected={defectKind === "BOX"} className={defectKind === "BOX" ? "active" : ""} onClick={() => {setDefectKind("BOX");setDefectSearch("");}}><span>□</span><div><strong>Box lỗi</strong><small>Box móp, rách hoặc không sử dụng được</small></div><b>{data.defectiveProducts.filter((item) => item.kind === "BOX").reduce((sum,item) => sum+Number(item.quantity||0),0)}</b></button></div><div className="simple-toolbar"><input placeholder={`Tìm ${defectKind === "GLASSES" ? "kính" : "box"} lỗi, nguồn, mã đơn hoặc lý do…`} value={defectSearch} onChange={(event) => setDefectSearch(event.target.value)} /><span>{qty(filteredDefects.reduce((sum,item) => sum+Number(item.quantity||0),0))} sản phẩm lỗi</span></div><DefectsTable defects={filteredDefects} defectKind={defectKind} /></section>}
        {tab === "customers" && <section className="panel orders-panel page-panel"><PanelTitle eyebrow="HỒ SƠ KHÁCH HÀNG" title="Thông tin, lịch sử mua và tổng lãi" /><CustomersTable customers={data.customers} /></section>}
        {tab === "activity" && <section className="panel orders-panel page-panel"><PanelTitle eyebrow="TRUY VẾT KHO" title="Mọi lần nhập, giữ, bán, trả và điều chỉnh" /><MovementsTable movements={data.movements} /></section>}
        {tab === "users" && <UsersTab currentUser={currentUser} />}
        {tab === "test-lab" && <TestLab />}
        {tab === "manual" && <Manual />}
      </div>
    </main>

    {modal === "purchase" && <Modal title="Tạo đơn nhập hàng" eyebrow="NHU CẦU NHẬP · NGUỒN THEO TỪNG DÒNG" onClose={() => setModal(null)} wide><form onSubmit={submitPurchase}><div className="form-grid"><label>Ngày tạo nhu cầu<input name="orderDate" type="date" min="2026-01-01" defaultValue={todayValue()} required /></label><label>Trạng thái<select name="status" defaultValue="DRAFT"><option value="DRAFT">Nháp — chờ gom đơn</option><option value="ORDERED">Đang đặt — gửi ngay</option></select></label></div><LineEditor kind="purchase" lines={purchaseLines} setLines={setPurchaseLines} products={data.products} glassesInventory={data.glassesInventory} boxInventory={data.boxInventory} lots={data.lots} sourceOptions={data.inventorySources} /><div className="form-grid three"><label>Chi phí ship<input name="shipCost" type="number" min="0" step="1000" defaultValue="0" /><small className="field-help">Với đơn nháp, chi phí này được cộng sẵn khi gom.</small></label><label>Tiền cọc NCC<input name="deposit" type="number" min="0" step="1000" defaultValue="0" /></label><label>Phương thức<select name="paymentMethod"><option>Chuyển khoản</option><option>Tiền mặt</option><option>Khác</option></select></label></div><label>Ghi chú<input name="note" /></label><div className="rule-preview compact"><strong>Quy tắc gom và nhận hàng</strong><span>Mỗi dòng chọn nguồn riêng. Tạo Nháp để chờ gom; khi đủ số lượng, tick các đơn nháp ở danh sách và tạo một đơn đặt tổng.</span><b>Chỉ đơn đặt tổng được nhận hàng; các đơn nháp đã gom được giữ lại để truy vết và không thể đặt trùng.</b></div><ModalActions busy={busy} onCancel={() => setModal(null)} label="Tạo đơn nhập" /></form></Modal>}
    {modal === "purchase-consolidate" && <Modal title={`Gom ${selectedDraftOrders.length} đơn nháp`} eyebrow="TẠO MỘT ĐƠN ĐẶT HÀNG TỔNG" onClose={() => setModal(null)} wide><form onSubmit={submitConsolidation}><div className="batch-preview"><div><span>Đơn nháp</span><strong>{selectedDraftOrders.map((order)=>String(order.code)).join(", ")}</strong></div><div><span>Sản phẩm</span><strong>{qty(selectedDraftItems.reduce((sum,item)=>sum+Number(item.ordered_qty||0),0))} sản phẩm · {selectedDraftSources.length} nguồn</strong><small>{selectedDraftSources.join(", ")||"Chưa xác định"}</small></div><div><span>Tiền hàng</span><strong>{money(selectedDraftOrders.reduce((sum,order)=>sum+Number(order.total_amount||0),0))}</strong></div></div><div className="form-grid three"><label>Ngày gửi đơn tổng<input name="orderDate" type="date" min="2026-01-01" defaultValue={todayValue()} required /></label><label>Chi phí ship<input name="shipCost" type="number" min="0" step="1000" defaultValue={selectedDraftOrders.reduce((sum,order)=>sum+Number(order.ship_cost||0),0)} /></label><label>Tiền cọc NCC<input name="deposit" type="number" min="0" step="1000" defaultValue="0" /></label></div><div className="form-grid"><label>Phương thức<select name="paymentMethod"><option>Chuyển khoản</option><option>Tiền mặt</option><option>Khác</option></select></label><label>Ghi chú đơn tổng<input name="note" placeholder="VD: Đợt đặt cuối tuần" /></label></div><div className="source-note">Sau khi xác nhận, app tạo một đơn “Đang đặt”, giữ nguyên SKU, số lượng, giá nhập và nguồn của từng dòng. Các đơn nháp nguồn sẽ chuyển sang “Đã gom”.</div><ModalActions busy={busy} onCancel={() => setModal(null)} label="Gom và tạo đơn đặt" /></form></Modal>}
    {modal === "purchase-detail" && selected && <Modal title={`${selected.code} · ${String(selected.tracking_sources||selected.supplier)}`} eyebrow="CHI TIẾT ĐƠN NHẬP" onClose={() => setModal(null)} wide><PurchaseDetail order={selected} onReceive={() => setModal("receive")} onPay={() => setModal("supplier-payment")} onEdit={() => void openPurchaseEdit(selected)} /></Modal>}
    {modal === "receive" && selected && <ReceivePurchaseModal order={selected} busy={busy} onClose={() => setModal("purchase-detail")} onSubmit={async ({receivedAt,note,items}) => {await action("receive_purchase_order",{purchaseOrderId:selected.id,receivedAt,note,items},"Đã nhận hàng: hàng tốt vào kho, hàng lỗi được tách riêng.");}} />}
    {modal === "purchase-edit" && selected && <Modal title={`Sửa ${selected.code}`} eyebrow="THÔNG TIN ĐƠN NHẬP" onClose={() => setModal(null)} wide><form onSubmit={async (event) => {event.preventDefault();const fd=form(event);const canEditLines=Number(selected.received_qty||0)===0&&Number(selected.consolidated_from_count||0)===0;await action("update_purchase_order",{id:selected.id,orderDate:value(fd,"orderDate"),status:value(fd,"status"),shipCost:number(fd,"shipCost"),note:value(fd,"note"),lines:canEditLines?purchaseLines:undefined},"Đã cập nhật đơn nhập.");}}><div className="form-grid three"><label>Ngày đặt<input name="orderDate" type="date" min="2026-01-01" defaultValue={dateValue(selected.order_date)} /></label><label>Trạng thái<select name="status" defaultValue={String(selected.status)}>{Object.entries(PURCHASE_STATUS).filter(([id])=>id!=="MERGED").map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Chi phí ship<input name="shipCost" type="number" min="0" step="1000" defaultValue={Number(selected.ship_cost||0)} /></label></div><label>Ghi chú<input name="note" defaultValue={String(selected.note||"")} /></label>{Number(selected.received_qty||0)===0&&Number(selected.consolidated_from_count||0)===0?<LineEditor kind="purchase" lines={purchaseLines} setLines={setPurchaseLines} products={data.products} glassesInventory={data.glassesInventory} boxInventory={data.boxInventory} lots={data.lots} sourceOptions={data.inventorySources} />:<div className="source-note">{Number(selected.consolidated_from_count||0)>0?"Danh sách sản phẩm của đơn tổng được bảo vệ để giữ liên kết với các đơn nháp nguồn.":"Đơn đã nhận hàng nên danh sách và số lượng đặt được bảo vệ. Nếu nhập sai tồn sau khi nhận, hãy sửa/kiểm kê tại tab Kiểm soát kho."}</div>}<ModalActions busy={busy} onCancel={() => setModal("purchase-detail")} label="Lưu thay đổi" /></form></Modal>}
    {modal === "supplier-payment" && selected && <PaymentModal supplier order={selected} busy={busy} onCancel={() => setModal("purchase-detail")} onSubmit={async (event) => {event.preventDefault();const fd=form(event);await action("add_supplier_payment",{purchaseOrderId:selected.id,paymentDate:value(fd,"paymentDate"),amount:number(fd,"amount"),paymentType:value(fd,"paymentType"),method:value(fd,"method"),note:value(fd,"note")},"Đã ghi nhận thanh toán nhà cung cấp.");}} />}
    {modal === "sales" && <Modal title={selected?`Sửa ${selected.code}`:"Tạo đơn hàng khách"} eyebrow="ĐƠN NHIỀU DÒNG SẢN PHẨM" onClose={() => setModal(null)} wide><form onSubmit={submitSales}><div className="form-grid three"><label>Ngày đơn<input name="orderDate" type="date" min="2026-01-01" defaultValue={dateValue(selected?.order_date)||todayValue()} required /></label><label>Khách hàng<input name="customer" defaultValue={String(selected?.customer||"")} required /></label><label>Số điện thoại<input name="phone" defaultValue={String(selected?.phone||"")} /></label></div><label>Địa chỉ<input name="address" defaultValue={String(selected?.address||"")} /></label><LineEditor kind="sales" lines={salesLines} setLines={setSalesLines} products={data.products} glassesInventory={data.glassesInventory} boxInventory={data.boxInventory} lots={data.lots} sourceOptions={data.inventorySources} reserveFromStock={!['DRAFT','WAITING_STOCK'].includes(salesWorkflow)} /><div className="sales-stock-scenarios"><article><b>TH1 · Chưa có kính</b><span>Chọn “Chờ nhập hàng”: vẫn lưu khách và tiền cọc nhưng chưa giữ kho.</span></article><article><b>TH2 · Kính có sẵn</b><span>Chọn “Đã nhận cọc”: app giữ kính ngay, số Có thể bán tự giảm.</span></article></div><div className="form-grid three"><label>Luồng xử lý<select name="status" value={salesWorkflow} onChange={(event)=>setSalesWorkflow(event.target.value)}><option value="WAITING_STOCK">TH1 · Chờ nhập hàng — chưa giữ kho</option><option value="DEPOSIT_RECEIVED">TH2 · Đã nhận cọc — giữ kho ngay</option><option value="DRAFT">Nháp — chưa nhận cọc, chưa giữ kho</option>{Object.entries(WORKFLOW).filter(([id])=>["ORDERING_SUPPLIER","GOODS_RECEIVED","READY_TO_SHIP","SHIPPING"].includes(id)).map(([id,label])=><option key={id} value={id}>{label} — giữ kho</option>)}</select></label><label>Tiền cọc ban đầu<input name="deposit" type="number" min="0" step="1000" defaultValue={Number(selected?.deposit||0)} disabled={Boolean(selected)} /></label><label>Phí ship<input name="ship" type="number" min="0" step="1000" value={salesShip} onChange={(event)=>setSalesShip(Number(event.target.value||0))} /></label></div><fieldset className="ship-payer-fieldset"><legend>Ai trả phí ship?</legend><div className="ship-payer-options"><label className={salesShipPayer==="SELLER"?"selected":""}><input type="radio" name="shipPayer" value="SELLER" checked={salesShipPayer==="SELLER"} onChange={()=>setSalesShipPayer("SELLER")} /><span><b>Người bán trả</b><small>Khách trả doanh thu; lãi trừ thêm phí ship.</small></span></label><label className={salesShipPayer==="RECIPIENT"?"selected":""}><input type="radio" name="shipPayer" value="RECIPIENT" checked={salesShipPayer==="RECIPIENT"} onChange={()=>setSalesShipPayer("RECIPIENT")} /><span><b>Người nhận trả</b><small>Khách trả doanh thu + ship; ship không làm giảm lãi.</small></span></label></div></fieldset><div className="order-live-summary"><div><span>Doanh thu</span><strong>{money(salesRevenue)}</strong></div><div><span>Phí ship</span><strong>{money(salesShip)}</strong></div><div><span>Tổng khách thanh toán</span><strong>{money(salesCustomerTotal)}</strong></div><div><span>Công thức lãi</span><strong>{salesShipPayer==="SELLER"?"Doanh thu − giá vốn − ship":"Doanh thu − giá vốn"}</strong></div></div><div className="form-grid"><label>Đơn vị vận chuyển<input name="carrier" defaultValue={String(selected?.carrier||"")} /></label><label>Phương thức cọc<select name="paymentMethod" disabled={Boolean(selected)}><option>Chuyển khoản</option><option>Tiền mặt</option><option>Khác</option></select></label></div><label>Ghi chú<textarea name="note" rows={2} defaultValue={String(selected?.note||"")} /></label><div className="rule-preview compact"><strong>Quy tắc kho và nguồn</strong><span>Chọn SKU trước; app chỉ hiện các nguồn đang có SKU đó. Box lẻ có thể khác nguồn kính; box kèm luôn đi theo nguồn kính.</span><b>Chờ nhập hàng chưa giữ kho. Từ Đã nhận cọc, app giữ đúng SKU và đúng nguồn của từng dòng.</b></div><ModalActions busy={busy} onCancel={() => setModal(null)} label={selected?"Lưu và tính lại kho":"Tạo đơn hàng"} /></form></Modal>}
    {modal === "sales-detail" && selected && <Modal title={`${selected.code} · ${selected.customer}`} eyebrow="CHI TIẾT ĐƠN KHÁCH" onClose={() => setModal(null)} wide><SalesDetail order={selected} onEdit={() => openSales(selected)} onStatus={() => setModal("status")} onPayment={() => setModal("payment")} onShipment={() => setModal("shipment")} /></Modal>}
    {modal === "status" && selected && <Modal title={`Đổi trạng thái · ${selected.code}`} eyebrow={`HIỆN TẠI: ${WORKFLOW[String(selected.workflow_status)]}`} onClose={() => setModal("sales-detail")}><form onSubmit={async (event) => {event.preventDefault();const fd=form(event);await action("change_sales_status",{orderId:selected.id,status:value(fd,"status"),reason:value(fd,"reason")},"Đã đổi trạng thái và cập nhật kho.");}}><label>Trạng thái mới<select name="status" defaultValue={selected.workflow_status === "WAITING_STOCK" ? "GOODS_RECEIVED" : "READY_TO_SHIP"}>{Object.entries(WORKFLOW).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Lý do / ghi chú<textarea name="reason" rows={3} placeholder="Bắt buộc khi hủy, trả hàng hoặc hoàn tiền" /></label><div className="source-note">Chờ nhập hàng không giữ kho. Khi hàng về, chuyển sang “Đã nhận hàng” để giữ đúng SKU. Hoàn tất sẽ trừ tồn; hủy sẽ giải phóng hàng đang giữ.</div><ModalActions busy={busy} onCancel={() => setModal("sales-detail")} label="Xác nhận trạng thái" /></form></Modal>}
    {modal === "payment" && selected && <PaymentModal order={selected} busy={busy} onCancel={() => setModal("sales-detail")} onSubmit={async (event) => {event.preventDefault();const fd=form(event);await action("add_order_payment",{orderId:selected.id,paymentDate:value(fd,"paymentDate"),amount:number(fd,"amount"),paymentType:value(fd,"paymentType"),method:value(fd,"method"),note:value(fd,"note")},"Đã ghi nhận thanh toán.");}} />}
    {modal === "shipment" && selected && <Modal title={`Vận chuyển · ${selected.code}`} eyebrow="VẬN ĐƠN VÀ PHÍ SHIP" onClose={() => setModal("sales-detail")}><form onSubmit={async (event) => {event.preventDefault();const fd=form(event);await action("upsert_shipment",{orderId:selected.id,carrier:value(fd,"carrier"),trackingCode:value(fd,"trackingCode"),estimatedFee:number(fd,"estimatedFee"),actualFee:number(fd,"actualFee"),shippedAt:value(fd,"shippedAt"),status:value(fd,"status"),note:value(fd,"note")},"Đã cập nhật vận chuyển và phí ship thực tế.");}}><div className="form-grid"><label>Đơn vị vận chuyển<input name="carrier" defaultValue={String((selected.shipment as Row|null)?.carrier||selected.carrier||"")} /></label><label>Mã vận đơn<input name="trackingCode" defaultValue={String((selected.shipment as Row|null)?.tracking_code||"")} /></label></div><div className="form-grid three"><label>Phí dự kiến<input name="estimatedFee" type="number" min="0" defaultValue={Number((selected.shipment as Row|null)?.estimated_fee||0)} /></label><label>Phí thực tế<input name="actualFee" type="number" min="0" defaultValue={Number((selected.shipment as Row|null)?.actual_fee||selected.ship||0)} /></label><label>Ngày gửi<input name="shippedAt" type="date" min="2026-01-01" defaultValue={dateValue((selected.shipment as Row|null)?.shipped_at)} /></label></div><div className="form-grid"><label>Trạng thái giao<select name="status" defaultValue={String((selected.shipment as Row|null)?.status||"PENDING")}><option value="PENDING">Chưa gửi</option><option value="SHIPPED">Đã gửi</option><option value="DELIVERED">Giao thành công</option><option value="FAILED">Giao thất bại</option><option value="RETURNED">Hoàn hàng</option></select></label><label>Ghi chú<input name="note" defaultValue={String((selected.shipment as Row|null)?.note||"")} /></label></div><ModalActions busy={busy} onCancel={() => setModal("sales-detail")} label="Lưu vận chuyển" /></form></Modal>}
    {modal === "product" && <Modal title={selected?.id?`Sửa ${selected.sku}`:`Thêm ${productKind === "GLASSES" ? "kính" : "box"}`} eyebrow="DANH MỤC KÍNH VÀ BOX" onClose={() => setModal(null)}><form onSubmit={async (event) => {event.preventDefault();const fd=form(event);await action("save_product",{kind:value(fd,"kind"),sku:value(fd,"sku"),name:value(fd,"name"),brand:value(fd,"brand"),model:value(fd,"model"),color:value(fd,"color"),compatibleBoxSku:value(fd,"compatibleBoxSku"),sourceSupplier:value(fd,"sourceSupplier"),lastPurchasePrice:number(fd,"lastPurchasePrice"),suggestedSalePrice:number(fd,"suggestedSalePrice")},"Đã lưu danh mục sản phẩm.");}}><div className="form-grid three"><label>Loại<select name="kind" defaultValue={String(selected?.kind||productKind)}><option value="GLASSES">Kính</option><option value="BOX">Box</option></select></label><label>SKU<input name="sku" defaultValue={String(selected?.sku||"")} required /></label><label>Tên chuẩn<input name="name" defaultValue={String(selected?.name||"")} required /></label></div><div className="form-grid three"><label>Thương hiệu<input name="brand" defaultValue={String(selected?.brand||"")} /></label><label>Model<input name="model" defaultValue={String(selected?.model||"")} /></label><label>Màu<input name="color" defaultValue={String(selected?.color||"")} /></label></div><div className="form-grid"><label>Loại box phù hợp<input name="compatibleBoxSku" defaultValue={String(selected?.compatible_box_sku||"")} /></label><label>Nguồn nhập<input name="sourceSupplier" defaultValue={String(selected?.source_supplier||"")} /></label></div><div className="form-grid"><label>Giá nhập gần nhất<input name="lastPurchasePrice" type="number" min="0" defaultValue={Number(selected?.last_purchase_price||0)} /></label><label>Giá bán đề xuất<input name="suggestedSalePrice" type="number" min="0" defaultValue={Number(selected?.suggested_sale_price||0)} /></label></div><ModalActions busy={busy} onCancel={() => setModal(null)} label="Lưu sản phẩm" /></form></Modal>}
    {modal === "lot" && selected && <Modal title={`Lô ${selected.sku}`} eyebrow="SỬA LÔ VÀ KIỂM KÊ" onClose={() => setModal(null)}><div className="lot-actions-grid"><form onSubmit={async (event) => {event.preventDefault();const fd=form(event);await action("edit_lot",{id:selected.id,kind:selected.kind,receivedAt:value(fd,"receivedAt"),supplier:value(fd,"supplier"),sku:value(fd,"sku"),name:value(fd,"name"),unitCost:number(fd,"unitCost"),note:value(fd,"note"),reason:value(fd,"reason")},"Đã sửa thông tin lô.");}}><h3>Sửa thông tin lô</h3><div className="form-grid"><label>Ngày nhập<input name="receivedAt" type="date" min="2026-01-01" defaultValue={dateValue(selected.received_at)} /></label><label>Nguồn<input name="supplier" defaultValue={String(selected.supplier)} /></label></div><div className="form-grid"><label>SKU<input name="sku" defaultValue={String(selected.sku)} /></label><label>Tên<input name="name" defaultValue={String(selected.name)} /></label></div><div className="form-grid"><label>Giá vốn<input name="unitCost" type="number" min="0" defaultValue={Number(selected.unit_cost)} /></label><label>Lý do sửa<input name="reason" placeholder="VD: nhập sai tên" /></label></div><label>Ghi chú<input name="note" defaultValue={String(selected.note||"")} /></label><button className="button secondary" disabled={busy}>Lưu thông tin</button></form><form onSubmit={async (event) => {event.preventDefault();const fd=form(event);await action("adjust_inventory",{id:selected.id,kind:selected.kind,delta:number(fd,"delta"),adjustmentType:value(fd,"adjustmentType"),reason:value(fd,"reason")},"Đã điều chỉnh tồn và ghi nhật ký.");}}><h3>Điều chỉnh tồn</h3><div className="current-stock"><span>Tồn thực tế hiện tại</span><strong>{qty(selected.remaining_qty)}</strong><small>Đang giữ {qty(selected.reserved_qty)}</small></div><label>Tăng/giảm số lượng<input name="delta" type="number" placeholder="VD: -1 hoặc 2" required /></label><label>Loại điều chỉnh<select name="adjustmentType"><option value="STOCKTAKE">Kiểm kê</option><option value="DAMAGED">Hỏng</option><option value="LOST">Mất</option><option value="MANUAL">Điều chỉnh khác</option></select></label><label>Lý do<textarea name="reason" rows={3} required /></label><button className="button primary" disabled={busy}>Cập nhật tồn</button></form></div></Modal>}
  </div>;
}

function shortMonth(value:unknown) { const [year,month]=String(value||"").split("-"); return month&&year?`T${Number(month)}/${year}`:String(value||""); }
function SourceCheckboxes({options,values,onChange,includeUnspecified=false}:{options:string[];values:string[];onChange:(values:string[])=>void;includeUnspecified?:boolean}) {
  const uniqueOptions = Array.from(new Set(options.map((item)=>item.trim()).filter(Boolean)));
  const entries = includeUnspecified ? [["__EMPTY__","Chưa xác định"],...uniqueOptions.map((item)=>[item,item])] : uniqueOptions.map((item)=>[item,item]);
  const toggle = (value:string) => onChange(values.includes(value) ? values.filter((item)=>item!==value) : [...values,value]);
  return <fieldset className="source-checkboxes"><legend>Nguồn nhập</legend><div>{entries.map(([value,label])=><label key={value}><input type="checkbox" checked={values.includes(value)} onChange={()=>toggle(value)} /><span>{label}</span></label>)}</div><small>{values.length ? `Đã chọn ${values.length} nguồn` : "Không tick = tất cả nguồn"}</small></fieldset>;
}

function SalesAnalyticsDashboard({data,filters,setFilters,loading,onApply,onReset}:{data:SalesDashboardData;filters:SalesDashboardFilters;setFilters:(value:SalesDashboardFilters)=>void;loading:boolean;onApply:()=>void;onReset:()=>void}) {
  const summary=data.summary||{};const monthly=rows(data.monthly);const topGlasses=rows(data.topGlasses);const topSources=rows(data.topSources);
  const bestGlasses=topGlasses[0];const bestSource=topSources[0];const maxMonthly=Math.max(1,...monthly.map((item)=>Number(item.glasses_sold||0)));const maxGlasses=Math.max(1,...topGlasses.map((item)=>Number(item.glasses_sold||0)));const maxSources=Math.max(1,...topSources.map((item)=>Number(item.glasses_sold||0)));
  return <section className="sales-analytics page-panel"><div className="analytics-header"><div><p className="eyebrow">PHÂN TÍCH BÁN HÀNG</p><h2>Kính bán ra, doanh thu và nguồn hiệu quả</h2><p>Chỉ tính kính thuộc các đơn đã Hoàn tất.</p></div><div className="analytics-freshness"><span>Dữ liệu hiện có</span><strong>{dateValue(data.coverage?.first_sale_date)||"—"} → {dateValue(data.coverage?.last_sale_date)||"—"}</strong><small>{data.generatedAt?`Cập nhật ${new Date(data.generatedAt).toLocaleString("vi-VN")}`:"Đang tải dữ liệu…"}</small></div></div><form className="analytics-filters" onSubmit={(event)=>{event.preventDefault();onApply();}}><label>Từ ngày<input type="date" min="2026-01-01" value={filters.fromDate} onChange={(event)=>setFilters({...filters,fromDate:event.target.value})} /></label><label>Đến ngày<input type="date" min="2026-01-01" value={filters.toDate} onChange={(event)=>setFilters({...filters,toDate:event.target.value})} /></label><SourceCheckboxes options={rows(data.sourceOptions).map((item)=>String(item.source_supplier))} values={filters.sources} onChange={(sources)=>setFilters({...filters,sources})} /><label>Tên kính<input list="analytics-glasses-options" placeholder="Nhập tên hoặc SKU kính" value={filters.glasses} onChange={(event)=>setFilters({...filters,glasses:event.target.value})} /><datalist id="analytics-glasses-options">{rows(data.glassesOptions).map((item)=><option key={String(item.sku)} value={String(item.name)}>{String(item.sku)}</option>)}</datalist></label><div className="analytics-filter-actions"><button type="button" className="button secondary" onClick={onReset}>Xóa lọc</button><button className="button primary" disabled={loading}>{loading?"Đang tải…":"Áp dụng"}</button></div></form><div className="analytics-kpis"><article><span className="analytics-kpi-icon blue">◇</span><p>Số kính đã bán</p><strong>{qty(summary.glasses_sold)}</strong><small>{qty(summary.completed_orders)} đơn hoàn tất</small></article><article><span className="analytics-kpi-icon green">₫</span><p>Doanh thu kính</p><strong>{money(summary.revenue)}</strong><small>Bình quân {money(summary.average_revenue_per_glasses)} / kính</small></article><article><span className="analytics-kpi-icon amber">★</span><p>Mẫu bán chạy nhất</p><strong className="text-value">{String(bestGlasses?.name||"Chưa có dữ liệu")}</strong><small>{bestGlasses?`${qty(bestGlasses.glasses_sold)} kính · ${money(bestGlasses.revenue)}`:"Trong khoảng ngày đã chọn"}</small></article><article><span className="analytics-kpi-icon violet">↗</span><p>Nguồn bán chạy nhất</p><strong className="text-value">{String(bestSource?.source_supplier||"Chưa có dữ liệu")}</strong><small>{bestSource?`${qty(bestSource.glasses_sold)} kính · ${money(bestSource.revenue)}`:"Trong khoảng ngày đã chọn"}</small></article></div>{monthly.length?<><div className="analytics-chart-grid"><article className="analytics-chart-card monthly-card"><div className="analytics-card-heading"><div><p className="eyebrow">THEO THỜI GIAN</p><h3>Số kính bán mỗi tháng</h3></div><span>{dateValue(filters.fromDate)} → {dateValue(filters.toDate)}</span></div><div className="monthly-bars" aria-label="Biểu đồ số kính bán mỗi tháng">{monthly.map((item)=><div className="monthly-column" key={String(item.sale_month)} title={`${shortMonth(item.sale_month)}: ${qty(item.glasses_sold)} kính, ${money(item.revenue)}`}><strong>{qty(item.glasses_sold)}</strong><div className="monthly-track"><span style={{height:`${Math.max(4,Number(item.glasses_sold||0)/maxMonthly*100)}%`}} /></div><b>{shortMonth(item.sale_month)}</b><small>{money(item.revenue)}</small></div>)}</div></article><article className="analytics-chart-card"><div className="analytics-card-heading"><div><p className="eyebrow">XẾP HẠNG</p><h3>Mẫu kính bán chạy</h3></div><span>Top {topGlasses.length}</span></div><div className="ranked-bars">{topGlasses.slice(0,6).map((item,index)=><div className="ranked-row" key={String(item.sku)}><span className="rank-number">{index+1}</span><div className="rank-label"><strong>{String(item.name)}</strong><small>{String(item.sku)} · {money(item.revenue)}</small></div><div className="rank-track"><span style={{width:`${Number(item.glasses_sold||0)/maxGlasses*100}%`}} /></div><b>{qty(item.glasses_sold)}</b></div>)}</div></article></div><div className="analytics-chart-grid lower"><article className="analytics-chart-card"><div className="analytics-card-heading"><div><p className="eyebrow">NGUỒN NHẬP</p><h3>Nguồn bán chạy</h3></div><span>Theo số kính</span></div><div className="ranked-bars source-bars">{topSources.slice(0,8).map((item,index)=><div className="ranked-row" key={String(item.source_supplier)}><span className="rank-number">{index+1}</span><div className="rank-label"><strong>{String(item.source_supplier)}</strong><small>{qty(item.completed_orders)} đơn · {money(item.revenue)}</small></div><div className="rank-track"><span style={{width:`${Number(item.glasses_sold||0)/maxSources*100}%`}} /></div><b>{qty(item.glasses_sold)}</b></div>)}</div></article><article className="analytics-chart-card detail-card"><div className="analytics-card-heading"><div><p className="eyebrow">CHI TIẾT</p><h3>Hiệu quả theo tháng</h3></div><span>Doanh thu dòng kính</span></div><div className="table-wrap"><table><thead><tr><th>Tháng</th><th>Số kính</th><th>Đơn hoàn tất</th><th>Doanh thu</th></tr></thead><tbody>{monthly.slice().reverse().map((item)=><tr key={String(item.sale_month)}><td><strong>{shortMonth(item.sale_month)}</strong></td><td>{qty(item.glasses_sold)}</td><td>{qty(item.completed_orders)}</td><td><strong>{money(item.revenue)}</strong></td></tr>)}</tbody></table></div></article></div></>:<div className="analytics-empty"><Empty text={loading?"Đang tải dữ liệu dashboard…":"Không có đơn Hoàn tất phù hợp với bộ lọc."} /></div>}<div className="analytics-definition"><span>i</span><div><strong>Cách tính</strong><p>{data.metricDefinition||"Số liệu được tổng hợp từ các dòng kính trong đơn Hoàn tất."}</p></div></div></section>;
}

function Metric({icon,tone,label,value,note}:{icon:string;tone:string;label:string;value:string;note:string}) { return <article className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><p>{label}</p><strong>{value}</strong><span className="trend">{note}</span></article>; }
function PanelTitle({eyebrow,title,action,onAction}:{eyebrow:string;title:string;action?:string;onAction?:()=>void}) { return <div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>{action&&<button className="text-button" onClick={onAction}>{action}</button>}</div>; }
function StatusTag({status,purchase=false}:{status:string;purchase?:boolean}) { const success=["COMPLETED","RECEIVED"].includes(status);const danger=["CANCELLED","RETURNED","REFUNDED"].includes(status);return <span className={`tag ${success?"success":danger?"danger":"pending"}`}>{purchase?PURCHASE_STATUS[status]||status:WORKFLOW[status]||status}</span>; }
function Empty({text}:{text:string}) { return <div className="empty-state"><strong>{text}</strong><span>Dữ liệu sẽ xuất hiện sau khi bạn tạo nghiệp vụ đầu tiên.</span></div>; }

function Pagination({currentPage,totalItems,pageSize=15,onPageChange,onPageSizeChange,pageSizeOptions=[5,10,15,20,25,50,100]}:{currentPage:number;totalItems:number;pageSize?:number;onPageChange:(page:number)=>void;onPageSizeChange?:(size:number)=>void;pageSizeOptions?:number[]}) {
  if (totalItems <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);
  const options = Array.from(new Set([...pageSizeOptions, pageSize])).sort((a, b) => a - b);

  return <div className="pagination">
    <div className="pagination-info">
      <span>Hiển thị <strong>{start}</strong>–<strong>{end}</strong> trong <strong>{totalItems}</strong> mục</span>
      {onPageSizeChange && (
        <label className="pagination-size-select">
          <span>Số dòng:</span>
          <select value={pageSize} onChange={(e) => { const newSize = Number(e.target.value); onPageSizeChange(newSize); onPageChange(1); }}>
            {options.map((opt) => <option key={opt} value={opt}>{opt} / trang</option>)}
          </select>
        </label>
      )}
    </div>
    <div className="pagination-controls">
      <button type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>← Trước</button>
      <span className="pagination-current-page">Trang <strong>{safePage}</strong> / {totalPages}</span>
      <button type="button" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}>Sau →</button>
    </div>
  </div>;
}

function PurchaseTable({orders,onOpen,compact=false,selectedIds=[],onToggle}:{orders:Row[];onOpen:(order:Row)=>void;compact?:boolean;selectedIds?:string[];onToggle?:(id:string)=>void}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(compact ? 6 : 15);
  const totalItems = orders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedOrders = orders.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectable=Boolean(onToggle);
  return <>
    <div className="table-wrap"><table className={`app-table ${compact?"compact-table":""}`}><thead><tr>{selectable&&<th className="th-select">Gom</th>}<th className="th-code">Mã / Ngày</th><th className="th-source">Nguồn</th><th className="th-product">Sản phẩm</th><th className="th-progress">Tiến độ nhận</th><th className="th-money">Tiền hàng</th><th className="th-money">Ship</th><th className="th-money">Tổng chi</th><th className="th-money">Còn trả NCC</th><th className="th-status">Trạng thái</th><th className="th-action"></th></tr></thead><tbody>{pagedOrders.length?pagedOrders.map((order)=>{
      const id=String(order.id);const canSelect=effectivePurchaseStatus(order)==="DRAFT";const mergedIntoCode=String(order.merged_into_code||"");
      return <tr key={id} className={effectivePurchaseStatus(order)==="MERGED"?"merged-purchase-row":""}>{selectable&&<td className="td-select"><input className="purchase-select" type="checkbox" aria-label={`Chọn ${String(order.code)} để gom`} checked={selectedIds.includes(id)} disabled={!canSelect} onChange={()=>onToggle?.(id)} /></td>}<td className="td-code"><strong>{String(order.code)}</strong><small className="cell-note">{dateValue(order.order_date)}</small>{Number(order.consolidated_from_count)>0&&<small className="cell-note positive">Đơn tổng ({qty(order.consolidated_from_count)} nháp)</small>}{mergedIntoCode&&<small className="cell-note">Gom vào {mergedIntoCode}</small>}</td><td className="td-source"><span className="source-cell">{String(order.tracking_sources||order.supplier||"Chưa xác định")}</span></td><td className="td-product"><div className="product-summary-cell">{rows(order.items).filter((item)=>item.fulfillment_type!=="ATTACHED_BOX").map((item)=>`${item.name} ×${item.ordered_qty}`).join(" · ")||"—"}</div></td><td className="td-progress"><strong>{qty(order.received_qty)} / {qty(order.ordered_qty)}</strong><div className="progress"><span style={{width:`${Math.min(100,Number(order.ordered_qty)?Number(order.received_qty)/Number(order.ordered_qty)*100:0)}%`}} /></div></td><td className="td-money">{money(order.total_amount)}</td><td className="td-money">{money(order.ship_cost)}</td><td className="td-money"><strong>{money(Number(order.total_amount||0)+Number(order.ship_cost||0))}</strong></td><td className="td-money"><strong className={Number(order.outstanding)>0?"negative":"positive"}>{money(order.outstanding)}</strong></td><td className="td-status"><StatusTag status={effectivePurchaseStatus(order)} purchase /></td><td className="td-action"><button className="edit-button" onClick={()=>onOpen(order)}>Mở</button></td></tr>;
    }):<tr><td colSpan={selectable?11:10}><Empty text="Chưa có đơn nhập phù hợp." /></td></tr>}</tbody></table></div>
    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={compact ? [5,6,10,15,25,50] : [10,15,25,50,100]} />
  </>;
}

function SalesTable({orders,onOpen,defaultPageSize=15}:{orders:Row[];onOpen:(order:Row)=>void;defaultPageSize?:number}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const totalItems = orders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedOrders = orders.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <>
    <div className="table-wrap"><table className="app-table sales-table"><thead><tr><th className="th-code">Mã / Ngày</th><th className="th-customer">Khách hàng</th><th className="th-product">Sản phẩm</th><th className="th-source">Nguồn</th><th className="th-money">Tổng khách trả</th><th className="th-money">Đã thu</th><th className="th-money">Lãi</th><th className="th-hold">Giữ kho</th><th className="th-status">Trạng thái</th><th className="th-action"></th></tr></thead><tbody>{pagedOrders.length?pagedOrders.map((order)=><tr key={String(order.id)}><td className="td-code"><strong>{String(order.code)}</strong><small className="cell-note">{dateValue(order.order_date)}</small></td><td className="td-customer"><strong>{String(order.customer)}</strong><small className="cell-note">{String(order.phone||"")}</small></td><td className="td-product"><div className="product-summary-cell">{rows(order.items).map((item)=>`${fullProductName(item)} ×${item.quantity}`).join(" · ")}</div></td><td className="td-source"><span className="source-cell">{String(order.tracking_source||order.source_supplier||"Chưa xác định")}</span></td><td className="td-money">{money(orderCustomerTotal(order))}<small className="cell-note">{order.ship_payer==="RECIPIENT"?"Người nhận trả ship":"Người bán trả ship"}</small></td><td className="td-money">{money(order.paid_amount)}</td><td className="td-money">{order.workflow_status==="WAITING_STOCK"?<span className="waiting-cost">Chờ giá vốn</span>:<strong className={Number(order.display_profit)>=0?"positive":"negative"}>{money(order.display_profit)}</strong>}</td><td className="td-hold">{Number(order.reserved_qty)>0?<span className="tag pending">{qty(order.reserved_qty)} SP</span>:order.workflow_status==="WAITING_STOCK"?<small className="cell-note">Chưa giữ</small>:"—"}</td><td className="td-status"><StatusTag status={String(order.workflow_status)} /></td><td className="td-action"><button className="edit-button" onClick={()=>onOpen(order)}>Mở</button></td></tr>):<tr><td colSpan={10}><Empty text="Không tìm thấy đơn hàng." /></td></tr>}</tbody></table></div>
    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[5,8,10,15,25,50,100]} />
  </>;
}
function InventoryTable({title,rows:items,kind}:{title:string;rows:Row[];kind:"GLASSES"|"BOX"}) { const columns=kind==="BOX"?8:5;return <div className="inventory-block"><h3>{title}</h3><div className="table-wrap inventory-table"><table><thead><tr><th>Tên / SKU</th><th>Nguồn</th>{kind==="BOX"&&<><th>Box lẻ</th><th>Kèm kính</th><th>Chờ kính</th></>}<th>Thực tế</th><th>Đang giữ</th><th>Có thể bán</th></tr></thead><tbody>{items.length?items.map((item)=><tr key={String(item.sku)}><td><strong>{String(item.name)}</strong><small className="cell-note">{String(item.sku)}</small></td><td>{String(item.suppliers||"—")}</td>{kind==="BOX"&&<><td>{qty(item.loose_qty)}</td><td>{qty(item.attached_qty)}</td><td>{Number(item.pending_attached_qty)?<span className="tag pending">{qty(item.pending_attached_qty)}</span>:"—"}</td></>}<td>{qty(kind==="BOX"?Number(item.loose_qty||0)+Number(item.attached_qty||0):item.on_hand)}</td><td>{qty(item.reserved)}</td><td><strong className="inventory-quantity">{qty(item.available)}</strong></td></tr>):<tr><td colSpan={columns}><Empty text={`Không có ${kind==="GLASSES"?"kính":"box"} phù hợp với bộ lọc.`} /></td></tr>}</tbody></table></div></div>; }

function CustomersTable({customers}:{customers:Row[]}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalItems = customers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedCustomers = customers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <>
    <div className="table-wrap"><table><thead><tr><th>Khách hàng</th><th>Điện thoại</th><th>Địa chỉ</th><th>Số đơn</th><th>Tổng mua</th><th>Tổng lãi</th><th>Đơn gần nhất</th></tr></thead><tbody>{pagedCustomers.length?pagedCustomers.map((customer)=><tr key={String(customer.id)}><td><strong>{String(customer.display_name)}</strong></td><td>{String(customer.phone||"—")}</td><td className="wide-cell">{String(customer.primary_address||"—")}</td><td>{qty(customer.order_count)}</td><td>{money(customer.total_revenue)}</td><td><strong className={Number(customer.total_profit)>=0?"positive":"negative"}>{money(customer.total_profit)}</strong></td><td>{dateValue(customer.last_order_date)||"—"}</td></tr>):<tr><td colSpan={7}><Empty text="Chưa có khách hàng." /></td></tr>}</tbody></table></div>
    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[10,20,30,50,100]} />
  </>;
}

function MovementsTable({movements}:{movements:Row[]}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const totalItems = movements.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedMovements = movements.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <>
    <div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Nghiệp vụ</th><th>Sản phẩm</th><th>Kho thực tế</th><th>Đang giữ</th><th>Tham chiếu</th><th>Lý do</th><th>Người thực hiện</th></tr></thead><tbody>{pagedMovements.length?pagedMovements.map((item)=><tr key={String(item.id)}><td>{String(item.occurred_at).replace("T"," ").slice(0,16)}</td><td><span className="type-pill">{MOVEMENT_LABEL[String(item.movement_type)]||String(item.movement_type)}</span></td><td><strong>{String(item.name||item.sku)}</strong><small className="cell-note">{String(item.sku)}</small></td><td className={Number(item.physical_delta)<0?"negative":Number(item.physical_delta)>0?"positive":""}>{Number(item.physical_delta)>0?"+":""}{qty(item.physical_delta)}</td><td className={Number(item.reserved_delta)<0?"negative":Number(item.reserved_delta)>0?"positive":""}>{Number(item.reserved_delta)>0?"+":""}{qty(item.reserved_delta)}</td><td>{String(item.reference_type)}<small className="cell-note">{String(item.reference_id).slice(0,12)}</small></td><td>{String(item.reason||"—")}</td><td>{String(item.actor||"—")}</td></tr>):<tr><td colSpan={8}><Empty text="Chưa có biến động kho." /></td></tr>}</tbody></table></div>
    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[10,25,50,100]} />
  </>;
}

function ProductsTable({products,productKind,onEdit}:{products:Row[];productKind:"GLASSES"|"BOX";onEdit:(product:Row)=>void}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalItems = products.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedProducts = products.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <>
    <div className="table-wrap"><table><thead>{productKind === "GLASSES" ? <tr><th>SKU / Tên kính</th><th>Thương hiệu</th><th>Model / Màu</th><th>Box phù hợp</th><th>Nguồn</th><th>Giá nhập gần nhất</th><th>Giá bán đề xuất</th><th>Tồn / Giữ / Bán</th><th></th></tr> : <tr><th>SKU / Tên box</th><th>Nguồn nhập</th><th>Giá nhập gần nhất</th><th>Giá bán đề xuất</th><th>Tồn thực tế</th><th>Đang giữ</th><th>Có thể bán</th><th></th></tr>}</thead><tbody>{pagedProducts.length?pagedProducts.map((product)=>productKind === "GLASSES" ? <tr key={String(product.id)}><td><strong>{String(product.sku)}</strong><small className="cell-note">{String(product.name)}</small></td><td>{String(product.brand || "—")}</td><td>{String(product.model || "—")}<small className="cell-note">{String(product.color || "")}</small></td><td>{String(product.compatible_box_sku || "—")}</td><td>{String(product.source_supplier || "—")}</td><td>{money(product.last_purchase_price)}</td><td>{money(product.suggested_sale_price)}</td><td>{qty(product.on_hand)} / {qty(product.reserved)} / <strong>{qty(Number(product.on_hand||0)-Number(product.reserved||0))}</strong></td><td><button className="edit-button" onClick={() => onEdit(product)}>Sửa</button></td></tr> : <tr key={String(product.id)}><td><strong>{String(product.sku)}</strong><small className="cell-note">{String(product.name)}</small></td><td>{String(product.source_supplier || "—")}</td><td>{money(product.last_purchase_price)}</td><td>{money(product.suggested_sale_price)}</td><td>{qty(product.on_hand)}</td><td>{qty(product.reserved)}</td><td><strong className="inventory-quantity">{qty(Number(product.on_hand||0)-Number(product.reserved||0))}</strong></td><td><button className="edit-button" onClick={() => onEdit(product)}>Sửa</button></td></tr>):<tr><td colSpan={productKind === "GLASSES" ? 9 : 8}><Empty text={`Chưa có ${productKind === "GLASSES" ? "kính" : "box"} nào.`} /></td></tr>}</tbody></table></div>
    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[10,20,30,50,100]} />
  </>;
}

function DefectsTable({defects,defectKind}:{defects:Row[];defectKind:"GLASSES"|"BOX"}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalItems = defects.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedDefects = defects.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <>
    <div className="table-wrap"><table><thead><tr><th>Ngày nhận</th><th>SKU / Sản phẩm</th><th>Nguồn</th><th>Số lượng lỗi</th><th>Giá vốn / SP</th><th>Đơn nhập / Phiếu nhận</th><th>Lý do lỗi</th></tr></thead><tbody>{pagedDefects.length?pagedDefects.map((item)=><tr key={String(item.id)}><td>{dateValue(item.received_at)}</td><td><strong>{String(item.sku)}</strong><small className="cell-note">{String(item.name)}</small></td><td>{String(item.supplier||"—")}</td><td><strong className="negative">{qty(item.quantity)}</strong></td><td>{money(item.unit_cost)}</td><td>{String(item.purchase_order_code||"—")}<small className="cell-note">{String(item.receipt_code||"")}</small></td><td className="wide-cell">{String(item.defect_reason||"—")}</td></tr>):<tr><td colSpan={7}><Empty text={`Chưa có ${defectKind === "GLASSES" ? "kính" : "box"} lỗi.`} /></td></tr>}</tbody></table></div>
    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[10,20,30,50,100]} />
  </>;
}

function LotsTable({lots,inventoryKind,onEdit}:{lots:Row[];inventoryKind:"GLASSES"|"BOX";onEdit:(lot:Row)=>void}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalItems = lots.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedLots = lots.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <>
    <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Sản phẩm</th><th>Loại</th><th>Nguồn</th><th>Thực tế</th><th>Đang giữ</th><th>Giá vốn</th><th></th></tr></thead><tbody>{pagedLots.length ? pagedLots.map((lot) => <tr key={String(lot.id)}><td>{dateValue(lot.received_at)}</td><td><strong>{String(lot.name)}</strong><small className="cell-note">{String(lot.sku)}</small></td><td>{lot.kind === "BOX" ? "Box lẻ" : "Kính"}</td><td>{String(lot.supplier)}</td><td>{qty(lot.remaining_qty)}</td><td>{qty(lot.reserved_qty)}</td><td>{money(lot.unit_cost)}</td><td><button className="edit-button" onClick={() => onEdit(lot)}>Sửa / kiểm kê</button></td></tr>) : <tr><td colSpan={8}><Empty text={`Không có lô ${inventoryKind === "GLASSES" ? "kính" : "box"} phù hợp với bộ lọc.`} /></td></tr>}</tbody></table></div>
    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[10,20,30,50,100]} />
  </>;
}

function PurchaseDetail({order,onReceive,onPay,onEdit}:{order:Row;onReceive:()=>void;onPay:()=>void;onEdit:()=>void}) { const status=effectivePurchaseStatus(order);const merged=status==="MERGED";return <>{merged&&<div className="source-note merged-note"><strong>Đơn nháp đã được gom vào {String(order.merged_into_code||"đơn đặt tổng")}</strong><span>Đơn này chỉ còn dùng để truy vết. Hãy nhận hàng và thanh toán trên đơn đặt tổng để tránh ghi nhận trùng.</span></div>}{Number(order.consolidated_from_count)>0&&<div className="source-note"><strong>Đây là đơn đặt tổng từ {qty(order.consolidated_from_count)} đơn nháp</strong><span>Mỗi dòng hàng bên dưới vẫn giữ nguyên nguồn nhập ban đầu.</span></div>}<div className="detail-summary purchase-money-summary"><div><span>Trạng thái</span><StatusTag status={status} purchase /></div><div><span>Tiền hàng</span><strong>{money(order.total_amount)}</strong></div><div><span>Phí ship</span><strong>{money(order.ship_cost)}</strong></div><div><span>Tổng chi</span><strong>{money(Number(order.total_amount||0)+Number(order.ship_cost||0))}</strong></div><div><span>Đã trả NCC</span><strong>{money(order.paid_amount)}</strong></div><div><span>Còn phải trả</span><strong className={Number(order.outstanding)>0?"negative":"positive"}>{money(order.outstanding)}</strong></div></div><div className="table-wrap"><table><thead><tr><th>Dòng hàng</th><th>Loại</th><th>Nguồn</th><th>Đặt</th><th>Đã nhận</th><th>Còn chờ</th><th>Giá nhập</th><th>Thành tiền</th></tr></thead><tbody>{rows(order.items).map((item)=><tr key={String(item.id)}><td><strong>{String(item.name)}</strong><small className="cell-note">{String(item.sku)}</small></td><td>{LINE_LABEL[String(item.fulfillment_type)]||String(item.fulfillment_type)}{Number(item.waiting_for_glasses)>0&&<small className="cell-note negative">{qty(item.waiting_for_glasses)} box theo kính đã về, chờ kính tốt</small>}</td><td><strong>{String(item.source_supplier||order.supplier||"Chưa xác định")}</strong></td><td>{qty(item.ordered_qty)}</td><td>{qty(item.received_qty)}{Number(item.defective_received_qty)>0&&<small className="cell-note negative">Lỗi {qty(item.defective_received_qty)}</small>}</td><td>{qty(item.pending_qty)}</td><td>{money(item.unit_cost)}</td><td>{money(Number(item.ordered_qty)*Number(item.unit_cost))}</td></tr>)}</tbody></table></div>{!merged&&<div className="detail-actions"><button className="button secondary" onClick={onEdit}>Sửa đơn nhập</button><button className="button secondary" onClick={onPay}>Thanh toán NCC</button>{!["RECEIVED","CANCELLED"].includes(status)&&<button className="button primary" onClick={onReceive}>Nhận kính / box</button>}</div>}{rows(order.receipts).length>0&&<div className="history-strip"><strong>Các lần nhận:</strong>{rows(order.receipts).map((receipt)=><span key={String(receipt.id)}>{String(receipt.code)} · {dateValue(receipt.received_at)}</span>)}</div>}</>; }

type ReceiveDraft = { goodQuantity:number; defectiveQuantity:number; boxStockType:"LOOSE"|"ATTACHED"; unitCost:number; defectReason:string };
function ReceivePurchaseModal({order,busy,onClose,onSubmit}:{order:Row;busy:boolean;onClose:()=>void;onSubmit:(value:{receivedAt:string;note:string;items:Row[]})=>Promise<void>}) {
  const orderItems = rows(order.items);
  const [drafts,setDrafts] = useState<Record<string,ReceiveDraft>>(() => Object.fromEntries(orderItems.map((item) => [String(item.id), {
    goodQuantity:0, defectiveQuantity:0,
    boxStockType:item.fulfillment_type === "LOOSE_BOX" ? "LOOSE" : "ATTACHED",
    unitCost:Number(item.unit_cost||0), defectReason:"",
  }])));
  const update = (id:string,change:Partial<ReceiveDraft>) => setDrafts((current) => ({...current,[id]:{...current[id],...change}}));
  return <Modal title={`Nhận hàng · ${order.code}`} eyebrow="TÁCH HÀNG TỐT, HÀNG LỖI VÀ BOX" onClose={onClose} wide><form onSubmit={async (event) => {event.preventDefault();const fd=new FormData(event.currentTarget);await onSubmit({receivedAt:String(fd.get("receivedAt")||""),note:String(fd.get("note")||""),items:orderItems.map((item)=>({itemId:String(item.id),...drafts[String(item.id)]}))});}}><div className="form-grid"><label>Ngày nhận<input name="receivedAt" type="date" min="2026-01-01" defaultValue={todayValue()} required /></label><label>Ghi chú lần giao<input name="note" placeholder="VD: giao đợt 1, kính lỗi nhưng giữ lại box" /></label></div><div className="receive-guide"><div><b>Hàng tốt</b><span>Được cộng vào kho sau khi xác nhận.</span></div><div><b>Hàng lỗi</b><span>Chuyển sang tab Sản phẩm lỗi, không được bán.</span></div><div><b>Box lẻ</b><span>Nhập giá theo đúng thời giá của lần nhận này.</span></div></div><div className="receive-lines enhanced">{orderItems.map((item) => {const id=String(item.id);const draft=drafts[id];const pending=Number(item.pending_qty||0);const isBox=item.kind === "BOX";const forcedLoose=item.fulfillment_type === "LOOSE_BOX";return <div className={`receive-line enhanced ${pending<=0?"done":""}`} key={id}><div className="receive-product"><strong>{String(item.name)}</strong><span>{LINE_LABEL[String(item.fulfillment_type)]||String(item.fulfillment_type)} · {String(item.sku)}</span><small>Đặt {qty(item.ordered_qty)} · Đã nhận {qty(item.received_qty)} · Còn chờ {qty(pending)}</small>{Number(item.good_received_qty)>0&&<small className="positive">Tốt {qty(item.good_received_qty)}{Number(item.defective_received_qty)>0?` · Lỗi ${qty(item.defective_received_qty)}`:""}</small>}{Number(item.waiting_for_glasses)>0&&<em>{qty(item.waiting_for_glasses)} box theo kính đã về, đang chờ kính tốt</em>}</div><div className="receive-inputs"><label>Số tốt<input type="number" min="0" max={Math.max(0,pending-draft.defectiveQuantity)} value={draft.goodQuantity} disabled={pending<=0} onChange={(event)=>update(id,{goodQuantity:Number(event.target.value||0)})} /></label><label>Số lỗi<input type="number" min="0" max={Math.max(0,pending-draft.goodQuantity)} value={draft.defectiveQuantity} disabled={pending<=0} onChange={(event)=>update(id,{defectiveQuantity:Number(event.target.value||0)})} /></label></div>{isBox&&<div className="box-receive-options"><label className="box-mode-toggle"><input type="checkbox" checked={draft.boxStockType === "LOOSE"} disabled={pending<=0||forcedLoose} onChange={(event)=>update(id,{boxStockType:event.target.checked?"LOOSE":"ATTACHED",unitCost:event.target.checked?Number(item.unit_cost||0):0})} /><span><b>Nhận thành box lẻ</b><small>{draft.boxStockType === "LOOSE"?"Cộng vào kho box lẻ":"Box theo kính, giá trị box = 0 ₫"}</small></span></label>{draft.boxStockType === "LOOSE"&&<label>Giá nhập box lẻ lần này<input type="number" min="0" value={draft.unitCost} disabled={pending<=0} onChange={(event)=>update(id,{unitCost:Number(event.target.value||0)})} /><small className="field-help">Có thể thay đổi theo từng lần nhận.</small></label>}</div>}{draft.defectiveQuantity>0&&<label className="defect-reason">Lý do lỗi<input value={draft.defectReason} required placeholder={isBox?"VD: box móp, rách":"VD: kính trầy, gãy, sai mẫu"} onChange={(event)=>update(id,{defectReason:event.target.value})} /></label>}</div>;})}</div><div className="source-note">Ví dụ: kính full box bị lỗi nhưng box tốt → nhập kính vào “Số lỗi”, nhập box vào “Số tốt”, rồi tick “Nhận thành box lẻ” và nhập giá box theo thời điểm nhận.</div><ModalActions busy={busy} onCancel={onClose} label="Xác nhận đã nhận" /></form></Modal>;
}
function SalesDetail({order,onEdit,onStatus,onPayment,onShipment}:{order:Row;onEdit:()=>void;onStatus:()=>void;onPayment:()=>void;onShipment:()=>void}) { return <><div className="detail-summary"><div><span>Trạng thái</span><StatusTag status={String(order.workflow_status)} /></div><div><span>Tổng khách thanh toán</span><strong>{money(orderCustomerTotal(order))}</strong></div><div><span>Đã thanh toán</span><strong>{money(order.paid_amount)}</strong></div><div><span>Lãi</span>{order.workflow_status==="WAITING_STOCK"?<b className="waiting-cost">Chờ giá vốn</b>:<strong className={Number(order.display_profit)>=0?"positive":"negative"}>{money(order.display_profit)}</strong>}</div></div><div className="customer-card"><div><strong>{String(order.customer)}</strong><span>{String(order.phone||"Chưa có số điện thoại")}</span><small>{String(order.address||"Chưa có địa chỉ")}</small></div><div><span>{order.workflow_status==="WAITING_STOCK"?"Nguồn từng dòng dự kiến":"Nguồn từng dòng thực tế"}</span><strong>{String(order.tracking_source||order.source_supplier||"Chưa xác định")}</strong><small>Mỗi kính/box được truy riêng theo dòng sản phẩm.</small></div><div><span>Vận chuyển · {order.ship_payer==="RECIPIENT"?"người nhận trả":"người bán trả"}</span><strong>{String((order.shipment as Row|null)?.carrier||order.carrier||"Chưa cập nhật")}</strong><small>{money(order.ship)} · {String((order.shipment as Row|null)?.tracking_code||"Chưa có mã vận đơn")}</small></div></div><div className="table-wrap"><table><thead><tr><th>Sản phẩm</th><th>Loại</th><th>Nguồn</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{rows(order.items).map((item)=><tr key={String(item.id)}><td><strong>{fullProductName(item)}</strong><small className="cell-note">{String(item.sku)}{item.box_sku?` · Box ${item.box_sku}`:""}</small></td><td>{LINE_LABEL[String(item.line_type)]||String(item.line_type)}</td><td><strong>{String(item.source_supplier||"Chưa xác định")}</strong>{item.line_type==="GLASSES_WITH_LOOSE"&&<small className="cell-note">Box: {String(item.box_source_supplier||"Chưa xác định")}</small>}{item.line_type==="GLASSES_WITH_ATTACHED"&&<small className="cell-note">Box kèm cùng nguồn</small>}</td><td>{qty(item.quantity)}</td><td>{money(item.unit_price)}</td><td>{money(Number(item.quantity)*Number(item.unit_price))}</td></tr>)}</tbody></table></div><div className="detail-actions"><button className="button secondary" onClick={onEdit} disabled={["COMPLETED","REFUNDED"].includes(String(order.workflow_status))}>Sửa / đổi sản phẩm</button><button className="button secondary" onClick={onPayment}>Thu / hoàn tiền</button><button className="button secondary" onClick={onShipment}>Vận chuyển</button><button className="button primary" onClick={onStatus}>Đổi trạng thái</button></div>{rows(order.payments).length>0&&<div className="history-strip"><strong>Sổ thanh toán:</strong>{rows(order.payments).map((payment)=><span key={String(payment.id)}>{dateValue(payment.payment_date)} · {String(payment.payment_type)} · {money(payment.amount)}</span>)}</div>}</>; }

function LineEditor({kind,lines,setLines,products=[],glassesInventory=[],boxInventory=[],lots=[],sourceOptions=[],reserveFromStock=false}:{kind:"purchase";lines:PurchaseLine[];setLines:(lines:PurchaseLine[])=>void;products?:Row[];glassesInventory?:Row[];boxInventory?:Row[];lots?:Row[];sourceOptions?:Row[];reserveFromStock?:boolean}|{kind:"sales";lines:SalesLine[];setLines:(lines:SalesLine[])=>void;products?:Row[];glassesInventory?:Row[];boxInventory?:Row[];lots?:Row[];sourceOptions?:Row[];reserveFromStock?:boolean}) {
  const update=(index:number,key:string,item:string|number)=>setLines(lines.map((line,current)=>current===index?{...line,[key]:item}:line) as never);
  const updateFields=(index:number,fields:Partial<PurchaseLine>|Partial<SalesLine>)=>setLines(lines.map((line,current)=>current===index?{...line,...fields}:line) as never);
  const add=()=>setLines([...lines,kind==="purchase"?{type:"GLASSES_ONLY",sku:"",sourceSupplier:"",name:"",quantity:1,unitCost:0,boxSku:"",boxName:""}:{type:"GLASSES_ONLY",sku:"",name:"",boxSku:"",sourceSupplier:"",boxSourceSupplier:"",quantity:1,unitPrice:0}] as never);
  const uniqueBySku=(items:Row[])=>Array.from(new Map(items.map((item)=>[String(item.sku),item])).values());
  const sourcesIn=(item:Row)=>String(item.suppliers||item.supplier||item.source_supplier||"").split(",").map((source)=>source.trim()).filter(Boolean);
  const allSourceChoices=Array.from(new Set([...sourceOptions.map((item)=>String(item.supplier||"").trim()),...lines.flatMap((item)=>kind==="sales"?[(item as SalesLine).sourceSupplier,(item as SalesLine).boxSourceSupplier]:[(item as PurchaseLine).sourceSupplier])].filter(Boolean))).sort();
  const sourceMatches=(item:Row,source:string)=>!source||String(item.suppliers||item.source_supplier||"").split(",").some((value)=>value.trim().toLocaleLowerCase("vi-VN")===source.trim().toLocaleLowerCase("vi-VN"));
  const optionsFor=(itemKind:"GLASSES"|"BOX",source:string,selectedSku:string)=>{
    const inventory=(itemKind==="GLASSES"?glassesInventory:boxInventory).filter((item)=>sourceMatches(item,source)&&(Number(item.available||0)>0||String(item.sku)===selectedSku));
    const catalog=products.filter((item)=>item.kind===itemKind&&sourceMatches(item,source));
    return reserveFromStock?inventory:uniqueBySku([...inventory,...catalog]);
  };
  const sourcesForSku=(itemKind:"GLASSES"|"BOX",sku:string,currentSource:string)=>{
    if(!sku.trim()) return [];
    const matchingLots=lots.filter((item)=>item.kind===itemKind&&String(item.sku)===sku&&(
      Number(item.remaining_qty||0)-Number(item.reserved_qty||0)>0||String(item.supplier||"")===currentSource
    ));
    const matchingInventory=(itemKind==="GLASSES"?glassesInventory:boxInventory).filter((item)=>String(item.sku)===sku&&(Number(item.available||0)>0||sourcesIn(item).includes(currentSource)));
    const matchingCatalog=products.filter((item)=>item.kind===itemKind&&String(item.sku)===sku);
    const pool=reserveFromStock?(matchingLots.length?matchingLots:matchingInventory):[...matchingLots,...matchingInventory,...matchingCatalog];
    return Array.from(new Set([...pool.flatMap(sourcesIn),currentSource].filter(Boolean))).sort();
  };
  const attachedBoxFor=(sku:string,source:string)=>{
    const exactLot=lots.find((item)=>item.kind==="GLASSES"&&String(item.sku)===sku&&String(item.supplier||"").toLocaleLowerCase("vi-VN")===source.toLocaleLowerCase("vi-VN"));
    if(exactLot?.included_box_sku) return String(exactLot.included_box_sku);
    const inventory=glassesInventory.find((item)=>String(item.sku)===sku&&sourceMatches(item,source));
    const catalog=products.find((item)=>item.kind==="GLASSES"&&String(item.sku)===sku&&sourceMatches(item,source));
    return String(inventory?.included_box_sku||catalog?.compatible_box_sku||"");
  };
  return <div className="line-editor"><div className="line-editor-heading"><strong>Danh sách sản phẩm · nguồn được chọn riêng cho từng dòng</strong><button type="button" onClick={add}>+ Thêm dòng</button></div>{lines.map((line,index)=>{
    const purchaseLine=kind==="purchase"?line as PurchaseLine:null;
    const salesLine=kind==="sales"?line as SalesLine:null;
    const primaryKind=(purchaseLine?.type==="LOOSE_BOX"||salesLine?.type==="BOX_ONLY")?"BOX":"GLASSES";
    const glassOptions=optionsFor("GLASSES","",primaryKind==="GLASSES"?line.sku:"");
    const boxSource=salesLine?.type==="GLASSES_WITH_LOOSE"?salesLine.boxSourceSupplier:salesLine?.sourceSupplier||purchaseLine?.sourceSupplier||"";
    const selectedBoxSku=(salesLine?.type==="BOX_ONLY"||purchaseLine?.type==="LOOSE_BOX")?line.sku:line.boxSku||"";
    const boxOptions=optionsFor("BOX",(salesLine?.type==="BOX_ONLY"||purchaseLine?.type==="LOOSE_BOX")?"":boxSource,selectedBoxSku);
    const primaryOptions=primaryKind==="BOX"?boxOptions:glassOptions;
    const currentSource=salesLine?.sourceSupplier||purchaseLine?.sourceSupplier||"";
    const skuSources=sourcesForSku(primaryKind,line.sku,currentSource);
    const primarySourceChoices=skuSources.length?skuSources:(!reserveFromStock&&line.sku?allSourceChoices:[]);
    const glassList=`glasses-options-${kind}-${index}`; const boxList=`box-options-${kind}-${index}`; const sourceList=`purchase-sources-${index}`;
    const salesClass=salesLine?` sales-line-${salesLine.type.toLocaleLowerCase("en-US").replaceAll("_","-")}`:"";
    const purchaseClass=purchaseLine?` purchase-line-row purchase-line-${purchaseLine.type.toLocaleLowerCase("en-US").replaceAll("_","-")}`:"";
    return <div className={`line-row${kind==="sales"?` sales-line-row${salesClass}`:purchaseClass}`} key={index}>
      <div className="line-number">{index+1}</div>
      <label>Loại<select value={line.type} onChange={(event)=>{if(kind==="sales"){const nextType=event.target.value as SalesLine["type"];updateFields(index,{type:nextType,boxSku:["GLASSES_WITH_ATTACHED","GLASSES_WITH_LOOSE"].includes(nextType)?(line as SalesLine).boxSku:"",boxSourceSupplier:nextType==="GLASSES_WITH_LOOSE"?(line as SalesLine).boxSourceSupplier:""});}else{const nextType=event.target.value as PurchaseLine["type"];updateFields(index,{type:nextType,boxSku:nextType==="FULL_BOX"?(line as PurchaseLine).boxSku:"",boxName:nextType==="FULL_BOX"?(line as PurchaseLine).boxName:""});}}}>{kind==="purchase"?<><option value="FULL_BOX">Kính full box</option><option value="GLASSES_ONLY">Chỉ kính</option><option value="LOOSE_BOX">Box nhập lẻ</option></>:<><option value="GLASSES_WITH_ATTACHED">Kính + box kèm</option><option value="GLASSES_ONLY">Chỉ kính</option><option value="GLASSES_WITH_LOOSE">Kính + box lẻ</option><option value="BOX_ONLY">Chỉ box</option></>}</select></label>
      <label>SKU<input title={line.sku} list={primaryKind==="BOX"?boxList:glassList} value={line.sku} onChange={(event)=>{
        const nextSku=event.target.value;
        const chosen=primaryOptions.find((product)=>String(product.sku)===nextSku);
        const nextSources=chosen?sourcesForSku(primaryKind,nextSku,""):[];
        const sourceSupplier=nextSources.length===1?nextSources[0]:"";
        if(purchaseLine){const nextFields:Partial<PurchaseLine>={sku:nextSku,name:chosen?String(chosen.name):"",sourceSupplier};if(purchaseLine.type==="FULL_BOX")nextFields.boxSku=sourceSupplier?attachedBoxFor(nextSku,sourceSupplier):"";updateFields(index,nextFields);return;}
        const nextFields:Partial<SalesLine>={sku:nextSku,name:chosen?String(chosen.name):"",sourceSupplier};
        if(salesLine?.type==="GLASSES_WITH_ATTACHED") nextFields.boxSku=sourceSupplier?attachedBoxFor(nextSku,sourceSupplier):"";
        updateFields(index,nextFields);
      }} required /><small className="field-help">Có thể chọn SKU có sẵn hoặc nhập SKU mới.</small></label>
      {purchaseLine&&<label>{purchaseLine.type==="LOOSE_BOX"?"Nguồn box":"Nguồn kính"}<input list={sourceList} value={purchaseLine.sourceSupplier} placeholder="Chọn hoặc nhập nguồn" onChange={(event)=>{const sourceSupplier=event.target.value;updateFields(index,{sourceSupplier,boxSku:purchaseLine.type==="FULL_BOX"&&sourceSupplier?attachedBoxFor(purchaseLine.sku,sourceSupplier):purchaseLine.type==="FULL_BOX"?"":purchaseLine.boxSku});}} required /><datalist id={sourceList}>{(primarySourceChoices.length?primarySourceChoices:allSourceChoices).map((source)=><option key={source} value={source} />)}</datalist><small className="field-help">Nguồn này chỉ áp dụng cho dòng {index+1}.</small></label>}
      {salesLine&&<label>{salesLine.type==="BOX_ONLY"?"Nguồn box":"Nguồn kính"}<select value={salesLine.sourceSupplier} required disabled={!salesLine.sku||primarySourceChoices.length===0} onChange={(event)=>{
        const sourceSupplier=event.target.value;
        updateFields(index,{sourceSupplier,boxSku:salesLine.type==="GLASSES_WITH_ATTACHED"&&sourceSupplier?attachedBoxFor(salesLine.sku,sourceSupplier):salesLine.type==="GLASSES_WITH_ATTACHED"?"":salesLine.boxSku});
      }}><option value="">{salesLine.sku?"Chọn nguồn":"Chọn SKU trước"}</option>{primarySourceChoices.map((source)=><option key={source} value={source}>{source}</option>)}</select><small className="field-help">{!salesLine.sku?"Nguồn sẽ hiện sau khi chọn SKU.":primarySourceChoices.length>1?`${primarySourceChoices.length} nguồn có SKU này.`:primarySourceChoices.length===1?"Đã nhận diện đúng nguồn của SKU.":"Không tìm thấy nguồn còn hàng."}</small></label>}
      <label>Tên<input title={line.name} value={line.name} onChange={(event)=>update(index,"name",event.target.value)} required /></label>
      {salesLine?.type==="GLASSES_WITH_LOOSE"&&<label>Nguồn box lẻ<select value={salesLine.boxSourceSupplier} required onChange={(event)=>updateFields(index,{boxSourceSupplier:event.target.value,boxSku:""})}><option value="">Chọn nguồn box</option>{allSourceChoices.map((source)=><option key={source} value={source}>{source}</option>)}</select></label>}
      {((purchaseLine?.type==="FULL_BOX")||(salesLine&&["GLASSES_WITH_ATTACHED","GLASSES_WITH_LOOSE"].includes(salesLine.type)))&&<label>SKU box<input title={line.boxSku} list={boxList} value={line.boxSku} onChange={(event)=>{const boxSku=event.target.value;const chosen=boxOptions.find((product)=>String(product.sku)===boxSku);if(purchaseLine)updateFields(index,{boxSku,boxName:chosen?String(chosen.name):""});else update(index,"boxSku",boxSku);}} required />{salesLine?.type==="GLASSES_WITH_ATTACHED"&&<small className="field-help">Box kèm cùng nguồn {salesLine.sourceSupplier||"kính"}.</small>}</label>}
      {kind==="purchase"&&line.type==="FULL_BOX"&&<label>Tên box<input value={(line as PurchaseLine).boxName} onChange={(event)=>update(index,"boxName",event.target.value)} required /></label>}
      <label>Số lượng<input type="number" min="1" value={line.quantity} onChange={(event)=>update(index,"quantity",Number(event.target.value))} required /></label>
      <label>{kind==="purchase"?"Giá nhập":"Giá bán"}{kind==="purchase"?<input type="number" min="0" step="1000" value={(line as PurchaseLine).unitCost} onChange={(event)=>update(index,"unitCost",Number(event.target.value))} required />:<CurrencyInput value={(line as SalesLine).unitPrice} onChange={(value)=>update(index,"unitPrice",value)} required />}</label>
      <button type="button" className="remove-line" disabled={lines.length===1} onClick={()=>setLines(lines.filter((_,current)=>current!==index) as never)}>×</button>
      <datalist id={glassList}>{glassOptions.map((item)=><option key={`${String(item.sku)}-${String(item.suppliers||item.source_supplier||"")}`} value={String(item.sku)}>{String(item.name)} · nguồn {String(item.suppliers||item.source_supplier||"—")}</option>)}</datalist><datalist id={boxList}>{boxOptions.map((item)=><option key={`${String(item.sku)}-${String(item.suppliers||item.source_supplier||"")}`} value={String(item.sku)}>{String(item.name)} · nguồn {String(item.suppliers||item.source_supplier||"—")}</option>)}</datalist>
    </div>;
  })}</div>;
}

function PaymentModal({order,supplier=false,busy,onCancel,onSubmit}:{order:Row;supplier?:boolean;busy:boolean;onCancel:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}) { return <Modal title={`${supplier?"Thanh toán NCC":"Thu / hoàn tiền"} · ${order.code}`} eyebrow={supplier?"THANH TOÁN ĐƠN NHẬP":"SỔ THANH TOÁN KHÁCH"} onClose={onCancel}><form onSubmit={onSubmit}><div className="form-grid three"><label>Ngày<input name="paymentDate" type="date" min="2026-01-01" defaultValue={todayValue()} required /></label><label>Loại<select name="paymentType">{supplier?<><option value="PAYMENT">Thanh toán thêm</option><option value="DEPOSIT">Cọc</option><option value="REFUND">NCC hoàn lại</option></>:<><option value="DEPOSIT">Cọc</option><option value="PAYMENT">Thanh toán</option><option value="SHIP">Thu tiền ship</option><option value="REFUND">Hoàn tiền</option></>}</select></label><label>Số tiền<input name="amount" type="number" min="1" step="1000" required /></label></div><div className="form-grid"><label>Phương thức<select name="method"><option>Chuyển khoản</option><option>Tiền mặt</option><option>COD</option><option>Khác</option></select></label><label>Ghi chú<input name="note" /></label></div><ModalActions busy={busy} onCancel={onCancel} label="Ghi thanh toán" /></form></Modal>; }
function Modal({title,eyebrow,onClose,children,wide=false}:{title:string;eyebrow:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}) { return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className={`modal ${wide?"wide-modal":""}`}><div className="modal-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button className="close-button" onClick={onClose} aria-label="Đóng">×</button></div>{children}</div></div>; }
function ModalActions({busy,onCancel,label}:{busy:boolean;onCancel:()=>void;label:string}) { return <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Đóng</button><button className="button primary" disabled={busy}>{busy?"Đang lưu…":label}</button></div>; }
function Manual() { return <section className="manual-page"><div className="manual-cover"><p className="eyebrow light">ORD STUDIO · QUY TRÌNH VẬN HÀNH</p><h2>Từ đặt hàng đến giao khách, mọi thay đổi đều có thể truy vết.</h2><p>Hệ thống tách rõ đơn nhập, phiếu nhận, tồn thực tế, hàng đang giữ, thanh toán và vận chuyển.</p></div><div className="manual-grid">{[["01","Tạo đơn nhập","Nhập mã đơn, nhà cung cấp và nhiều dòng kính/box. Đơn đang đặt chưa làm tăng kho."],["02","Nhận kính và box độc lập","Mở đơn nhập, bấm Nhận hàng rồi tách số tốt và số lỗi từng dòng. Có thể nhận thiếu hoặc giao nhiều lần."],["03","Box full-box về trước","Box được ghi nhận đã về nhưng giữ ở trạng thái chờ kính tốt. Chỉ khi kính tốt về, box mới ghép thành box kèm."],["04","Box nhập lẻ","Tick Nhận thành box lẻ và nhập giá theo từng lần nhận. Box lẻ tốt mới được cộng vào tồn thực tế."],["05","Hai trường hợp đơn khách","Chưa có kính: chọn Chờ nhập hàng, vẫn lưu cọc nhưng chưa giữ kho. Có kính sẵn: chọn Đã nhận cọc để giữ đúng SKU ngay."],["06","Giữ hàng","Chờ nhập hàng và Nháp chưa giữ. Từ Đã nhận cọc đến Đang giao sẽ giữ kho. Có thể bán = Tồn thực tế − Đang giữ."],["07","Hoàn tất / Hủy / Trả","Hoàn tất trừ tồn. Hủy giải phóng. Trả hàng hoàn tồn và lưu lý do. Hoàn tiền được ghi vào sổ thanh toán."],["08","Kiểm kê và nhật ký","Sửa thông tin lô hoặc điều chỉnh tăng/giảm với lý do. Mọi biến động ghi người, thời gian và tham chiếu."],["09","Thanh toán và lãi","Nguồn được chọn riêng từng dòng. Người nhận trả ship: tổng khách trả = doanh thu + ship, lãi không trừ ship. Người bán trả: tổng khách trả = doanh thu, lãi trừ ship."],["10","Vận chuyển","Lưu đơn vị vận chuyển, mã vận đơn, phí ship thực tế, ngày gửi và trạng thái giao."],["11","Danh mục chuẩn","Quản lý riêng kính và box với SKU, nguồn, giá nhập gần nhất và giá bán đề xuất."],["12","Sản phẩm lỗi","Kính hoặc box lỗi được tách khỏi kho bán và lưu theo phiếu nhận, nguồn, giá vốn cùng lý do lỗi."],["13","Dashboard bán hàng","Theo dõi kính bán mỗi tháng, doanh thu, mẫu kính và nguồn bán chạy. Có thể lọc theo ngày, nguồn và tên kính."],["14","Khu vực test","Nhập kho, lên đơn, giữ hàng, hoàn tất, hủy và hoàn trả trong môi trường test riêng. Dữ liệu này không đi vào kho, doanh thu hoặc lãi thật."]].map(([number,title,body])=><article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div><div className="manual-alert"><strong>Quy tắc quan trọng</strong><span>Chờ nhập hàng không giữ kho. Khi nhận hàng, chỉ số tốt vào kho; số lỗi vào tab Sản phẩm lỗi. Dashboard bán hàng chỉ tính dòng kính thuộc đơn Hoàn tất.</span></div></section>; }
