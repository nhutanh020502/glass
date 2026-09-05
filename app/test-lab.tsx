"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
type TestData = { metrics: Row; inventory: Row[]; orders: Row[]; events: Row[]; generatedAt: string; isolation: string };
type TestLine = { inventoryId: string; quantity: number; unitPrice: number };

const EMPTY: TestData = { metrics: {}, inventory: [], orders: [], events: [], generatedAt: "", isolation: "" };
const STATUS: Record<string, string> = {
  DRAFT: "Nháp", PROCESS: "Đang giữ hàng", COMPLETED: "Hoàn tất", CANCELLED: "Đã hủy", RETURNED: "Đã hoàn trả",
};
const EVENTS: Record<string, string> = {
  RECEIVE: "Nhập kho test", ORDER_CREATED: "Tạo đơn test", PROCESS: "Giữ hàng", COMPLETED: "Bán test",
  CANCELLED: "Hủy đơn test", RETURNED: "Hoàn hàng test",
};

function money(value: unknown) { return `${new Intl.NumberFormat("vi-VN").format(Number(value || 0))} ₫`; }
function qty(value: unknown) { return new Intl.NumberFormat("vi-VN").format(Number(value || 0)); }
function today() { return new Date().toISOString().slice(0, 10); }

export default function TestLab() {
  const [data, setData] = useState<TestData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [lines, setLines] = useState<TestLine[]>([{ inventoryId: "", quantity: 1, unitPrice: 0 }]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v2/test-lab", { cache: "no-store" });
      const result = await response.json() as TestData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Không thể tải dữ liệu test.");
      setData(result); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không thể tải dữ liệu test."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch isolated test data on mount
    void load();
  }, [load]);

  async function action(name: string, input: Row, success: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v2/actions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, input }),
      });
      const result = await response.json() as Row & { error?: string };
      if (!response.ok) throw new Error(result.error || "Không thể thực hiện thao tác test.");
      setNotice(success); await load(); window.setTimeout(() => setNotice(""), 4000); return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không thể thực hiện thao tác test."); return false; }
    finally { setBusy(false); }
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const form = new FormData(target);
    const ok = await action("test_receive", {
      kind: form.get("kind"), sku: form.get("sku"), name: form.get("name"), sourceSupplier: form.get("sourceSupplier"),
      quantity: Number(form.get("quantity") || 0), unitCost: Number(form.get("unitCost") || 0),
    }, "Đã nhập vào kho test. Kho thật không thay đổi.");
    if (ok) target.reset();
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const form = new FormData(target);
    const ok = await action("test_create_order", {
      orderDate: form.get("orderDate"), customer: form.get("customer"), phone: form.get("phone"),
      status: form.get("status"), note: form.get("note"), lines,
    }, "Đã tạo đơn test. Chỉ kho test được cập nhật.");
    if (ok) { target.reset(); setLines([{ inventoryId: "", quantity: 1, unitPrice: 0 }]); }
  }

  async function changeStatus(order: Row, status: string) {
    const label = status === "COMPLETED" ? "hoàn tất bán" : status === "CANCELLED" ? "hủy" : status === "RETURNED" ? "hoàn trả" : "giữ hàng";
    if (["CANCELLED", "RETURNED"].includes(status) && !window.confirm(`Xác nhận ${label} đơn test ${String(order.code)}?`)) return;
    await action("test_change_status", { orderId: order.id, status, reason: `Thao tác ${label} trong khu vực test` }, `Đã ${label} đơn test.`);
  }

  async function resetAll() {
    if (!window.confirm("Xóa toàn bộ kho, đơn và lịch sử TEST? Dữ liệu thật vẫn được giữ nguyên.")) return;
    await action("test_reset", {}, "Đã làm sạch toàn bộ dữ liệu test.");
  }

  const sellable = data.inventory.filter((item) => Number(item.available || 0) > 0);
  const filteredInventory = useMemo(() => data.inventory.filter((item) => `${item.sku} ${item.name} ${item.source_supplier}`.toLocaleLowerCase("vi-VN").includes(inventorySearch.toLocaleLowerCase("vi-VN"))), [data.inventory, inventorySearch]);
  const filteredOrders = useMemo(() => data.orders.filter((order) => `${order.code} ${order.customer} ${order.phone} ${order.status}`.toLocaleLowerCase("vi-VN").includes(orderSearch.toLocaleLowerCase("vi-VN"))), [data.orders, orderSearch]);
  const metrics = data.metrics;

  return <div className="test-lab-page">
    <section className="test-isolation-banner">
      <div className="test-shield">T</div><div><p className="eyebrow light">MÔI TRƯỜNG THỬ NGHIỆM ĐỘC LẬP</p><h2>Dữ liệu test không ảnh hưởng dữ liệu công ty</h2><p>Nhập kho, giữ hàng, bán, hủy và hoàn trả tại đây chỉ ghi vào các bảng test riêng. Kho thật, doanh thu thật và lợi nhuận thật không bị cập nhật.</p></div>
      <span className="test-badge">TEST ONLY</span>
    </section>
    {notice && <div className="notice success-notice">{notice}</div>}{error && <div className="notice error-notice">{error}</div>}
    <section className="analytics-kpis test-kpis">
      <article><span className="analytics-kpi-icon blue">◇</span><p>Tồn test thực tế</p><strong>{qty(metrics.on_hand)}</strong><small>Tổng kính và box trong kho test</small></article>
      <article><span className="analytics-kpi-icon amber">G</span><p>Đang giữ test</p><strong>{qty(metrics.reserved)}</strong><small>Chỉ từ đơn test trạng thái PROCESS</small></article>
      <article><span className="analytics-kpi-icon green">✓</span><p>Có thể bán test</p><strong>{qty(metrics.available)}</strong><small>Tồn test − đang giữ test</small></article>
      <article><span className="analytics-kpi-icon violet">₫</span><p>Doanh thu / lãi test</p><strong className="text-value">{money(metrics.revenue)}</strong><small>Lãi test {money(metrics.profit)} · không vào báo cáo thật</small></article>
    </section>
    <div className="test-form-grid">
      <section className="panel test-form-card"><div className="test-card-heading"><div><p className="eyebrow">BƯỚC 1</p><h3>Nhập hàng vào kho test</h3></div><span>Không cộng kho thật</span></div>
        <form onSubmit={receive}><div className="form-grid three"><label>Loại sản phẩm<select name="kind" defaultValue="GLASSES"><option value="GLASSES">Kính</option><option value="BOX">Box</option></select></label><label>SKU<input name="sku" placeholder="VD: TEST-GM-01" required /></label><label>Số lượng<input name="quantity" type="number" min="1" defaultValue="1" required /></label></div><div className="form-grid"><label>Tên sản phẩm<input name="name" placeholder="Tên kính hoặc box test" required /></label><label>Nguồn nhập<input name="sourceSupplier" placeholder="VD: CONG" /></label></div><label>Giá nhập / sản phẩm<input name="unitCost" type="number" min="0" step="1000" defaultValue="0" /></label><button className="button secondary test-submit" disabled={busy}>+ Nhập kho test</button></form>
      </section>
      <section className="panel test-form-card"><div className="test-card-heading"><div><p className="eyebrow">BƯỚC 2</p><h3>Lên đơn cho khách test</h3></div><span>Không ghi doanh thu thật</span></div>
        <form onSubmit={createOrder}><div className="form-grid three"><label>Ngày đơn<input name="orderDate" type="date" min="2026-01-01" defaultValue={today()} required /></label><label>Khách test<input name="customer" placeholder="Tên khách thử nghiệm" required /></label><label>Điện thoại<input name="phone" /></label></div><label>Trạng thái ban đầu<select name="status" defaultValue="PROCESS"><option value="PROCESS">PROCESS — giữ kho test</option><option value="DRAFT">Nháp — chưa giữ</option></select></label>
          <div className="test-lines"><div className="line-editor-heading"><strong>Sản phẩm trong đơn test</strong><button type="button" onClick={() => setLines([...lines,{inventoryId:"",quantity:1,unitPrice:0}])}>+ Thêm dòng</button></div>{lines.map((line,index)=><div className="test-line" key={index}><span>{index+1}</span><label>Sản phẩm<select value={line.inventoryId} onChange={(event)=>setLines(lines.map((item,i)=>i===index?{...item,inventoryId:event.target.value}:item))} required><option value="">Chọn từ kho test</option>{sellable.map((item)=><option value={String(item.id)} key={String(item.id)}>{item.kind === "BOX" ? "BOX" : "KÍNH"} · {String(item.name)} · còn {qty(item.available)}</option>)}</select></label><label>SL<input type="number" min="1" value={line.quantity} onChange={(event)=>setLines(lines.map((item,i)=>i===index?{...item,quantity:Number(event.target.value)}:item))} /></label><label>Giá bán / SP<input type="number" min="0" step="1000" value={line.unitPrice} onChange={(event)=>setLines(lines.map((item,i)=>i===index?{...item,unitPrice:Number(event.target.value)}:item))} /></label><button type="button" className="remove-line" disabled={lines.length===1} onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>×</button></div>)}</div>
          <label>Ghi chú<input name="note" placeholder="Tình huống cần thử" /></label><button className="button primary test-submit" disabled={busy||sellable.length===0}>+ Tạo đơn test</button>{sellable.length===0&&<small className="field-help">Hãy nhập ít nhất một sản phẩm vào kho test trước.</small>}
        </form>
      </section>
    </div>
    <section className="panel orders-panel"><div className="test-card-heading"><div><p className="eyebrow">KHO THỬ NGHIỆM</p><h3>Tồn, giữ và có thể bán trong test</h3></div><button className="icon-button" type="button" onClick={()=>void load()} disabled={loading}>↻</button></div><div className="simple-toolbar"><input placeholder="Tìm SKU, tên hoặc nguồn trong kho test…" value={inventorySearch} onChange={(event)=>setInventorySearch(event.target.value)} /><span>{filteredInventory.length} sản phẩm test</span></div><div className="table-wrap"><table><thead><tr><th>Loại</th><th>SKU / Tên</th><th>Nguồn</th><th>Giá nhập</th><th>Tồn test</th><th>Đang giữ</th><th>Có thể bán</th></tr></thead><tbody>{filteredInventory.length?filteredInventory.map((item)=><tr key={String(item.id)}><td><span className="type-pill">{item.kind === "BOX" ? "BOX" : "KÍNH"}</span></td><td><strong>{String(item.sku)}</strong><small className="cell-note">{String(item.name)}</small></td><td>{String(item.source_supplier||"—")}</td><td>{money(item.unit_cost)}</td><td>{qty(item.on_hand)}</td><td>{qty(item.reserved)}</td><td><strong className="inventory-quantity">{qty(item.available)}</strong></td></tr>):<tr><td colSpan={7}><div className="empty-state">Chưa có tồn kho test.</div></td></tr>}</tbody></table></div></section>
    <section className="panel orders-panel"><div className="test-card-heading"><div><p className="eyebrow">ĐƠN KHÁCH TEST</p><h3>Thử giữ hàng, bán, hủy và hoàn trả</h3></div><span>{filteredOrders.length} đơn test</span></div><div className="simple-toolbar"><input placeholder="Tìm mã đơn, khách hoặc trạng thái test…" value={orderSearch} onChange={(event)=>setOrderSearch(event.target.value)} /><span>Chỉ tính báo cáo test</span></div><div className="table-wrap"><table><thead><tr><th>Mã / Ngày</th><th>Khách test</th><th>Sản phẩm</th><th>Doanh thu test</th><th>Lãi test</th><th>Trạng thái</th><th>Thao tác test</th></tr></thead><tbody>{filteredOrders.length?filteredOrders.map((order)=><tr key={String(order.id)}><td><strong>{String(order.code)}</strong><small className="cell-note">{String(order.order_date)}</small></td><td>{String(order.customer)}<small className="cell-note">{String(order.phone||"")}</small></td><td className="wide-cell">{(Array.isArray(order.items)?order.items as Row[]:[]).map((item)=><small className="cell-note" key={String(item.id)}>{qty(item.quantity)} × {String(item.name)}</small>)}</td><td>{money(order.revenue)}</td><td>{money(order.profit)}</td><td><span className={`tag test-status ${String(order.status).toLowerCase()}`}>{STATUS[String(order.status)]||String(order.status)}</span></td><td><div className="test-row-actions">{order.status==="DRAFT"&&<button onClick={()=>void changeStatus(order,"PROCESS")}>Giữ hàng</button>}{["DRAFT","PROCESS"].includes(String(order.status))&&<button className="primary" onClick={()=>void changeStatus(order,"COMPLETED")}>Hoàn tất bán</button>}{["DRAFT","PROCESS"].includes(String(order.status))&&<button className="danger" onClick={()=>void changeStatus(order,"CANCELLED")}>Hủy</button>}{order.status==="COMPLETED"&&<button className="warning" onClick={()=>void changeStatus(order,"RETURNED")}>Hoàn trả</button>}</div></td></tr>):<tr><td colSpan={7}><div className="empty-state">Chưa có đơn test.</div></td></tr>}</tbody></table></div></section>
    <section className="panel orders-panel test-events"><div className="test-card-heading"><div><p className="eyebrow">NHẬT KÝ TEST</p><h3>Lịch sử biến động chỉ trong môi trường test</h3></div><button className="button danger-button" type="button" onClick={()=>void resetAll()} disabled={busy}>Xóa toàn bộ dữ liệu test</button></div><div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Nghiệp vụ test</th><th>Mô tả</th><th>Người thực hiện</th></tr></thead><tbody>{data.events.length?data.events.map((event)=><tr key={String(event.id)}><td>{String(event.occurred_at).replace("T"," ").slice(0,16)}</td><td><span className="type-pill">{EVENTS[String(event.event_type)]||String(event.event_type)}</span></td><td className="wide-cell">{String(event.description)}</td><td>{String(event.actor)}</td></tr>):<tr><td colSpan={4}><div className="empty-state">Chưa có lịch sử test.</div></td></tr>}</tbody></table></div></section>
  </div>;
}
