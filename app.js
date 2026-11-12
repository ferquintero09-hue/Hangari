/* Hangary — storefront + staff dashboard */
(() => {
  const cfg = window.HANGARY_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("TU-PROYECTO") && !cfg.SUPABASE_ANON_KEY.includes("TU_SUPABASE");
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const $ = (s) => document.querySelector(s);
  const money = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n || 0));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  // ===== IMÁGENES DEL MENÚ =====
  // Las fotos viven en la carpeta img/productos/. En Supabase (columna image_url) y en los productos demo
  // solo se escribe la ruta dentro de esa carpeta, ej.: "proteinas/pernil-de-cerdo-horneado.jpg".
  // Una URL completa (https://...) también funciona. Si la foto no existe se ve el placeholder.
  const PRODUCT_IMG_BASE = "img/productos/";
  const PRODUCT_IMG_PLACEHOLDER = PRODUCT_IMG_BASE + "_placeholder.svg";
  const demoProducts = [
    {id:"demo-1",name:"Pernil de cerdo horneado",description:"Jugoso, dorado y preparado con el sabor de la tradición.",category:"Proteínas",price:185000,unit:"por pieza",image:"proteinas/pernil-de-cerdo-horneado.jpg"},
    {id:"demo-2",name:"Pechuga rellena",description:"Una receta especial para compartir en familia.",category:"Proteínas",price:95000,unit:"por unidad",image:"proteinas/pechuga-rellena.jpg"},
    {id:"demo-3",name:"Ensalada navideña",description:"Fresca, cremosa y con el toque dulce de la casa.",category:"Ensaladas",price:48000,unit:"por porción familiar",image:"ensaladas/ensalada-navidena.jpg"},
    {id:"demo-4",name:"Ensalada de papa",description:"Ese acompañamiento clásico que nunca puede faltar.",category:"Ensaladas",price:42000,unit:"por porción familiar",image:"ensaladas/ensalada-de-papa.jpg"},
    {id:"demo-5",name:"Cena navideña Hangary",description:"Una combinación especial para llevar a la mesa.",category:"Platos",price:72000,unit:"por persona",image:"platos/cena-navidena-hangary.jpg"},
    {id:"demo-6",name:"Novenita para compartir",description:"Una selección deliciosa para acompañar tus encuentros.",category:"Novenitas",price:65000,unit:"por kit",image:"novenitas/novenita-para-compartir.jpg"}
  ];

  let products = [], cart = [], currentUser = null, profile = null, orders = [], orderFilter = "Todos";
  let statsPeriod = "all", inventoryItems = [], staffRealtimeChannel = null;
  let toastTimer;

  function notify(message, error=false) {
    const t=$("#toast"); t.textContent=message; t.classList.remove("hidden"); t.classList.toggle("error",error);
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add("hidden"),3800);
  }
  function openModal(id){ $("#"+id).classList.remove("hidden"); }
  function closeModal(id){ $("#"+id).classList.add("hidden"); }
  function total(){ return cart.reduce((s,x)=>s+x.price*x.quantity,0); }
  function productImage(p){
    const src = String(p.image_url || p.image || "").trim();
    if (!src) return PRODUCT_IMG_PLACEHOLDER;
    if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src.replace(/'/g, "%27");
    return encodeURI(PRODUCT_IMG_BASE + src.replace(/^[.\/\\]+/, "")).replace(/'/g, "%27");
  }

  async function loadProducts() {
    if (db) {
      const {data,error}=await db.from("products").select("id,name,description,category,price,unit,image_url,image_gallery,active").eq("active",true).order("sort_order");
      if (!error && data) products=data;
      else { console.error(error); products=demoProducts; notify("No fue posible cargar el catálogo. Mostrando productos de demostración.",true); }
    } else products=demoProducts;
    renderProducts();
  }
  function galleryImages(p) {
    const primary = String(p.image_url || p.image || "").trim();
    const extras = Array.isArray(p.image_gallery) ? p.image_gallery : [];
    return [...new Set([primary, ...extras].map(x => String(x || "").trim()).filter(Boolean))];
  }
  function resolveProductImage(src) {
    if (!src) return PRODUCT_IMG_PLACEHOLDER;
    if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src.replace(/'/g, "%27");
    return encodeURI(PRODUCT_IMG_BASE + src.replace(/^[.\/\\]+/, "")).replace(/'/g, "%27");
  }
  function renderProducts(category="Todos") {
    const list=category==="Todos"?products:products.filter(p=>p.category===category);
    $("#product-grid").innerHTML=list.length?list.map(p=>`
      <article class="product-card">
        <button class="product-photo product-photo-button" type="button" data-gallery="${esc(p.id)}" aria-label="Ver fotografías de ${esc(p.name)}" style="background-image:url('${esc(productImage(p))}'),url('${PRODUCT_IMG_PLACEHOLDER}')">
          <span class="product-category">${esc(p.category)}</span>
          <span class="photo-hint">Ver fotografías <span aria-hidden="true">↗</span></span>
        </button>
        <div class="product-info"><div><h3>${esc(p.name)}</h3><p>${esc(p.description||"Preparado para compartir.")}</p></div>
          <div class="product-buy"><div><strong>${money(p.price)}</strong><small>${esc(p.unit||"")}</small></div>
          <button class="add-button" data-add="${esc(p.id)}" aria-label="Agregar ${esc(p.name)}">+</button></div>
        </div>
      </article>`).join(""):'<p class="empty-state">Pronto tendremos productos en esta categoría.</p>';
    document.querySelectorAll("[data-add]").forEach(b=>b.addEventListener("click",()=>addToCart(b.dataset.add)));
    document.querySelectorAll("[data-gallery]").forEach(b=>b.addEventListener("click",()=>openProductGallery(b.dataset.gallery)));
  }
  function ensureGalleryModal() {
    if ($("#product-gallery-modal")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="gallery-backdrop hidden" id="product-gallery-modal" role="dialog" aria-modal="true" aria-label="Fotografías del producto">
        <section class="gallery-dialog">
          <button class="gallery-close" type="button" aria-label="Cerrar">×</button>
          <p class="eyebrow">Conoce cada detalle</p>
          <h2 class="gallery-title"></h2>
          <div class="gallery-main-wrap">
            <button class="gallery-arrow gallery-prev" type="button" aria-label="Fotografía anterior">‹</button>
            <img class="gallery-main" alt="">
            <button class="gallery-arrow gallery-next" type="button" aria-label="Fotografía siguiente">›</button>
          </div>
          <div class="gallery-thumbs" aria-label="Seleccionar fotografía"></div>
          <p class="gallery-counter"></p>
        </section>
      </div>`);
    const modal=$("#product-gallery-modal");
    modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest(".gallery-close"))closeProductGallery();});
    modal.querySelector(".gallery-prev").addEventListener("click",()=>changeGalleryImage(-1));
    modal.querySelector(".gallery-next").addEventListener("click",()=>changeGalleryImage(1));
    modal.querySelector(".gallery-thumbs").addEventListener("click",e=>{
      const b=e.target.closest("[data-gallery-index]");
      if(b)showGalleryImage(Number(b.dataset.galleryIndex));
    });
    document.addEventListener("keydown",e=>{
      if(modal.classList.contains("hidden"))return;
      if(e.key==="Escape")closeProductGallery();
      if(e.key==="ArrowLeft")changeGalleryImage(-1);
      if(e.key==="ArrowRight")changeGalleryImage(1);
    });
  }
  let activeGalleryImages=[], activeGalleryIndex=0;
  function openProductGallery(id) {
    const p=products.find(x=>String(x.id)===String(id));
    if(!p)return;
    activeGalleryImages=galleryImages(p);
    if(!activeGalleryImages.length)return;
    activeGalleryIndex=0;
    ensureGalleryModal();
    $("#product-gallery-modal .gallery-title").textContent=p.name;
    showGalleryImage(0);
    $("#product-gallery-modal").classList.remove("hidden");
    document.body.classList.add("gallery-open");
  }
  function showGalleryImage(index) {
    if(!activeGalleryImages.length)return;
    activeGalleryIndex=(index+activeGalleryImages.length)%activeGalleryImages.length;
    const modal=$("#product-gallery-modal");
    const src=resolveProductImage(activeGalleryImages[activeGalleryIndex]);
    const img=modal.querySelector(".gallery-main");
    img.src=src; img.alt=modal.querySelector(".gallery-title").textContent+" — fotografía "+(activeGalleryIndex+1);
    modal.querySelector(".gallery-counter").textContent=(activeGalleryIndex+1)+" de "+activeGalleryImages.length;
    modal.querySelector(".gallery-prev").disabled=activeGalleryImages.length<2;
    modal.querySelector(".gallery-next").disabled=activeGalleryImages.length<2;
    modal.querySelector(".gallery-thumbs").innerHTML=activeGalleryImages.map((path,i)=>`
      <button type="button" class="gallery-thumb ${i===activeGalleryIndex?"active":""}" data-gallery-index="${i}" aria-label="Ver fotografía ${i+1}">
        <img src="${esc(resolveProductImage(path))}" alt="">
        <span>${i===0?"Preparado":"Empaque"}</span>
      </button>`).join("");
  }
  function changeGalleryImage(delta){showGalleryImage(activeGalleryIndex+delta);}
  function closeProductGallery(){
    const modal=$("#product-gallery-modal");
    if(modal)modal.classList.add("hidden");
    document.body.classList.remove("gallery-open");
  }
  const dishRules = {
    "Plato 1": { count: 1, proteins: ["Capón relleno envuelto en tocineta","Medallones de cerdo","Pechuga Cordon Bleu"] },
    "Plato 2": { count: 2, proteins: ["Capón relleno envuelto en tocineta","Medallones de cerdo","Pechuga Cordon Bleu"] },
    "Plato 3": { count: 2, proteins: ["Capón relleno envuelto en tocineta","Medallones de cerdo","Pechuga Cordon Bleu","Lomo relleno","Pollo relleno"] }
  };
  const saladChoices=["Ensalada rusa","Ensalada colombiana"];
  const garnishChoices=["Papa amarilla en cascos","Papa a la francesa","Pan navideño","Rapiyuca"];
  function openDishConfigurator(p) {
    const rule=dishRules[p.name]; if(!rule){notify("No encontramos la configuración de este plato.",true);return;}
    let modal=$("#dish-config-modal");
    if(!modal){
      document.body.insertAdjacentHTML("beforeend",'<div class="modal-backdrop hidden" id="dish-config-modal"><section class="modal dish-config-modal" role="dialog" aria-modal="true" aria-labelledby="dish-config-title"><button class="icon-button modal-close" type="button" data-dish-close aria-label="Cerrar">×</button><p class="eyebrow">Personaliza tu plato</p><h2 id="dish-config-title"></h2><p class="dish-config-intro">Elige cómo quieres disfrutarlo. Todos los acompañamientos están incluidos.</p><form id="dish-config-form" class="form-grid"></form></section></div>');
      modal=$("#dish-config-modal");
      modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest("[data-dish-close]"))modal.classList.add("hidden");});
    }
    $("#dish-config-title").textContent=p.name+" · "+money(p.price);
    let fields="";
    for(let i=0;i<rule.count;i++){
      fields+='<label class="span-2">Proteína '+(i+1)+'<select name="protein_'+i+'" required><option value="">Selecciona una opción</option>';
      fields+=rule.proteins.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join("");
      fields+='</select></label>';
    }
    fields+='<label class="span-2">Ensalada<select name="salad" required><option value="">Selecciona una ensalada</option>'+saladChoices.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join("")+'</select></label>';
    const garnishImages={
      "Papa amarilla en cascos":"papa-amarilla-cascos.jpg",
      "Papa a la francesa":"papas-francesa.jpg",
      "Pan navideño":"pan-navideño.jpg",
      "Rapiyuca":"rapi-yuca.jpg"
    };
    fields+='<div class="garnish-field span-2"><span class="garnish-field-title">Guarnición</span><div class="garnish-options">'+garnishChoices.map(n=>'<label class="garnish-option"><input type="radio" name="garnish" value="'+esc(n)+'" required><span class="garnish-option-card"><img src="'+encodeURI(PRODUCT_IMG_BASE+'guarnicion/'+garnishImages[n])+'" alt="'+esc(n)+'" loading="lazy"><span>'+esc(n)+'</span></span></label>').join("")+'</div></div>';
    fields+='<div class="checkout-summary span-2"><span>Precio del plato</span><strong>'+money(p.price)+'</strong></div><button class="btn btn-primary btn-full span-2" type="submit">Agregar al pedido</button>';
    $("#dish-config-form").innerHTML=fields;
    $("#dish-config-form").onsubmit=e=>{
      e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget).entries());
      const options={proteinas:Array.from({length:rule.count},(_,i)=>d["protein_"+i]),ensalada:d.salad,guarnicion:d.garnish};
      cart.push({key:"dish-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),id:p.id,name:p.name,price:Number(p.price),quantity:1,options});
      modal.classList.add("hidden");renderCart();notify(p.name+" se agregó con sus acompañamientos.");
    };
    modal.classList.remove("hidden");
  }
  function addToCart(id) {
    const p=products.find(x=>String(x.id)===String(id)); if(!p)return;
    if(dishRules[p.name]){openDishConfigurator(p);return;}
    const found=cart.find(x=>String(x.id)===String(id)&&!x.options);
    if(found)found.quantity++;else cart.push({key:"item-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),id:p.id,name:p.name,price:Number(p.price),quantity:1});
    renderCart();notify(p.name+" se agregó a tu pedido.");
  }
  function changeQty(key,delta) {
    const item=cart.find(x=>x.key===key);if(!item)return;
    item.quantity+=delta;if(item.quantity<=0)cart=cart.filter(x=>x.key!==key);renderCart();
  }
  function optionsSummary(o) {
    if(!o)return "";
    return [].concat(o.proteinas||[],o.ensalada||[],o.guarnicion||[]).filter(Boolean).join(" · ");
  }
  function renderCart() {
    $("#cart-count").textContent=cart.reduce((s,x)=>s+x.quantity,0);
    $("#cart-total").textContent=money(total());$("#checkout-total").textContent=money(total());
    $("#checkout-open").disabled=!cart.length;
    $("#cart-items").innerHTML=cart.length?cart.map(x=>'<article class="cart-item"><div class="cart-item-copy"><strong>'+esc(x.name)+'</strong><small>'+money(x.price)+' c/u</small>'+(x.options?'<small class="cart-options">'+esc(optionsSummary(x.options))+'</small>':'')+'<div class="quantity"><button data-qty="'+esc(x.key)+'" data-delta="-1">−</button><span>'+x.quantity+'</span><button data-qty="'+esc(x.key)+'" data-delta="1">+</button></div></div><strong>'+money(x.price*x.quantity)+'</strong></article>').join(""):'<p class="empty-state">Tu carrito está esperando algo delicioso.</p>';
    document.querySelectorAll("[data-qty]").forEach(b=>b.addEventListener("click",()=>changeQty(b.dataset.qty,Number(b.dataset.delta))));
  }
  function showCart(){ $("#cart-overlay").classList.remove("hidden"); $("#cart-drawer").classList.remove("hidden"); }
  function hideCart(){ $("#cart-overlay").classList.add("hidden"); $("#cart-drawer").classList.add("hidden"); }
  function showOrderSuccess(orderCode) {
    $("#order-success-code").textContent = String(orderCode || "Registrado");
    $("#order-success").classList.remove("hidden");
    document.body.classList.add("success-open");
  }
  function closeOrderSuccess() {
    $("#order-success").classList.add("hidden");
    document.body.classList.remove("success-open");
  }


async function submitOrder(e) {
  e.preventDefault();

  const formElement = e.currentTarget;

  if (!db) {
    notify("Configura Supabase para registrar pedidos reales. El catálogo está en modo demostración.", true);
    return;
  }

  if (!cart.length) return;

  const form = Object.fromEntries(new FormData(formElement).entries());
  const items = cart.map(x => ({
    product_id: x.id,
    quantity: x.quantity,
    options: x.options || {}
  }));

  const btn = $("#submit-order");
  btn.disabled = true;
  btn.textContent = "Registrando…";

  try {
    const { data, error } = await db.rpc("create_public_order", {
      p_customer_name: form.customer_name,
      p_phone: form.phone,
      p_address: form.address,
      p_delivery_date: form.delivery_date,
      p_seller: form.seller || null,
      p_payment_method: form.payment_method,
      p_items: items
    });

    if (error) throw error;

    cart = [];
    renderCart();

    formElement.reset();

    closeModal("checkout-modal");
    hideCart();
    showOrderSuccess(data);

  } catch (err) {
    console.error(err);
    notify(err.message || "No se pudo registrar el pedido.", true);

  } finally {
    btn.disabled = false;
    btn.textContent = "Registrar pedido";
  }
}


  async function login(e) {
    e.preventDefault();
    if(!db){notify("Primero configura las credenciales de Supabase.",true);return;}
    const form=e.currentTarget;
    const button=form.querySelector('button[type="submit"]');
    const f=Object.fromEntries(new FormData(form).entries());
    button.disabled=true;button.textContent="Ingresando…";
    const {error}=await db.auth.signInWithPassword({email:f.email,password:f.password});
    if(error){notify("No fue posible iniciar sesión. Verifica tus datos.",true);button.disabled=false;button.textContent="Ingresar al panel";return;}
    await loadStaff();
    button.disabled=false;button.textContent="Ingresar al panel";
  }
  async function loadStaff() {
    const {data:{user}}=await db.auth.getUser(); currentUser=user;
    if(!user){showStore();return;}
    const {data:prof,error}=await db.from("profiles").select("id,full_name,role").eq("id",user.id).single();
    if(error||!prof||!["admin","delivery"].includes(prof.role)){
      await db.auth.signOut();showStore();notify("Tu usuario no tiene un rol habilitado en Hangary.",true);return;
    }
    profile=prof;$("#storefront").classList.add("hidden");$(".site-header").classList.add("hidden");$(".site-footer").classList.add("hidden");$("#staff-app").classList.remove("hidden");
    closeModal("login-modal");
    $("#staff-role-label").textContent=prof.role==="admin"?"Administrador":"Domiciliario";
    $("#dashboard-title").textContent=prof.role==="admin"?"Gestión de pedidos":"Mis entregas";
    $("#orders-tabs").classList.toggle("hidden",prof.role!=="admin");
    $("#team-management").classList.toggle("hidden",prof.role!=="admin");
    $("#admin-navigation").classList.toggle("hidden",prof.role!=="admin");
    $("#orders-view").classList.remove("hidden");$("#statistics-view").classList.add("hidden");$("#inventory-view").classList.add("hidden");
    document.querySelectorAll("[data-staff-view]").forEach(b=>b.classList.toggle("active",b.dataset.staffView==="orders"));
    if(prof.role==="admin"){await loadDeliveryTeam();await loadInventory();}
    await loadOrders();
    if(staffRealtimeChannel)db.removeChannel(staffRealtimeChannel);
    staffRealtimeChannel=db.channel("hangary-staff-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>loadOrders())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"order_items"},()=>loadOrders())
      .on("postgres_changes",{event:"*",schema:"public",table:"inventory_items"},()=>{if(profile?.role==="admin")loadInventory();})
      .on("postgres_changes",{event:"*",schema:"public",table:"inventory_movements"},()=>{if(profile?.role==="admin")loadInventory();})
      .subscribe();
  }
  function showStore(){
    if(staffRealtimeChannel&&db){db.removeChannel(staffRealtimeChannel);staffRealtimeChannel=null;}
    $("#staff-app").classList.add("hidden");$("#storefront").classList.remove("hidden");
    $(".site-header").classList.remove("hidden");$(".site-footer").classList.remove("hidden");
    currentUser=null;profile=null;orders=[];orderFilter="Todos";
  }
  async function loadOrders() {
    if(!db||!profile)return;
    $("#orders-list").innerHTML='<div class="loading">Actualizando pedidos…</div>';
    let q=db.from("orders").select("*,delivery_profile:profiles!orders_delivery_user_id_fkey(full_name),order_items(id,quantity,unit_price,product_name,options,product:products(category))").order("created_at",{ascending:false});
    if(profile.role==="delivery")q=q.eq("delivery_user_id",currentUser.id);
    const {data,error}=await q;
    if(error){console.error(error);$("#orders-list").innerHTML='<p class="empty-state">No fue posible consultar los pedidos.</p>';return;}
    orders=data||[]; renderDashboard();
  }
  function renderDashboard() {
    const pending=orders.filter(o=>o.status==="Pendiente").length;
    const active=orders.filter(o=>!["Entregado","Cancelado"].includes(o.status)).length;
    const delivered=orders.filter(o=>o.status==="Entregado").length;
    $("#stats-grid").innerHTML=`<div class="stat-card"><small>${profile.role==="admin"?"Pedidos pendientes":"Pedidos por gestionar"}</small><strong>${profile.role==="admin"?pending:active}</strong></div><div class="stat-card"><small>En proceso</small><strong>${orders.filter(o=>["Confirmado","En preparación","Asignado","En camino"].includes(o.status)).length}</strong></div><div class="stat-card"><small>Entregados</small><strong>${delivered}</strong></div>`;
    if(profile.role==="admin"&&!$("#statistics-view").classList.contains("hidden"))renderStatistics();
    const shown=orderFilter==="Todos"?orders:orders.filter(o=>o.status===orderFilter);
    $("#orders-list").innerHTML=shown.length?shown.map(orderCard).join(""):'<div class="empty-panel"><span>✧</span><h3>No hay pedidos en esta vista</h3><p>Cuando se registren pedidos, aparecerán aquí.</p></div>';
    document.querySelectorAll("[data-order-action]").forEach(b=>b.addEventListener("click",()=>updateOrder(b.dataset.id,b.dataset.orderAction)));
    document.querySelectorAll("[data-assign-order]").forEach(b=>b.addEventListener("click",()=>{const orderId=b.getAttribute("data-assign-order");if(!orderId||orderId==="undefined"){notify("No se pudo identificar el pedido. Actualiza el panel e inténtalo de nuevo.",true);console.error("ID de pedido ausente en botón de asignación",b);return;}assignDelivery(orderId);}));
    document.querySelectorAll("[data-payment]").forEach(b=>b.addEventListener("click",()=>confirmPayment(b.dataset.id)));
  }
  function orderCard(o) {
    const items=(o.order_items||[]).map(i=>`${i.quantity} × ${esc(i.product_name)}${i.options&&Object.keys(i.options).length?`<br><small class="order-item-options">${esc(optionsSummary(i.options))}</small>`:""}`).join("<br>");
    const admin=profile.role==="admin";
    const deliveryName=o.delivery_profile?.full_name || (o.delivery_user_id ? "Nombre no disponible" : "");
    let actions="";
    if(admin) {
      actions=`<div class="order-actions">
        ${o.status==="Pendiente"?`<button class="btn btn-primary btn-small" data-order-action="Confirmado" data-id="${o.id}">Confirmar pedido</button>`:""}
        <button class="btn btn-outline btn-small" data-payment="yes" data-id="${o.id}">${o.payment_status==="Pagado"?"Editar pago recibido":"Registrar pago recibido"}</button>
        ${!["Entregado","Cancelado"].includes(o.status)?`<button class="btn btn-outline btn-small" data-assign-order="${o.id}">Asignar domiciliario</button>`:""}
        ${o.status==="Confirmado"?`<button class="btn btn-outline btn-small" data-order-action="En preparación" data-id="${o.id}">En preparación</button>`:""}
        ${o.status==="En preparación"?`<button class="btn btn-outline btn-small" data-order-action="Asignado" data-id="${o.id}">Marcar asignado</button>`:""}
      </div>`;
    } else {
      actions=`<div class="order-actions">${o.status==="Asignado"?`<button class="btn btn-primary btn-small" data-order-action="En camino" data-id="${o.id}">Iniciar entrega</button>`:""}${o.status==="En camino"?`<button class="btn btn-primary btn-small" data-order-action="Entregado" data-id="${o.id}">Marcar entregado</button>`:""}</div>`;
    }
    const paymentDetail=o.payment_status==="Pagado"?`Pagado · ${esc(o.confirmed_payment_method||"Medio por clasificar")}`:"Pendiente de recaudo";
    return `<article class="order-card"><div class="order-top"><div><span class="order-code">${esc(o.order_number)}</span><span class="status status-${slug(o.status)}">${esc(o.status)}</span></div><strong>${money(o.total)}</strong></div>
      <div class="order-details"><div><small>CLIENTE</small><strong>${esc(o.customer_name)}</strong><span>${esc(o.phone)}</span></div><div><small>ENTREGA</small><strong>${formatDate(o.delivery_date)}</strong><span>${esc(o.address)}</span></div><div><small>PAGO</small><strong>${paymentDetail}</strong><span>Cliente indicó: ${esc(o.payment_method)} · ${esc(o.seller||"Sin vendedor")}</span></div></div>
      ${deliveryName?`<div class="assigned-delivery"><span class="assigned-delivery-icon">♧</span><div><small>DOMICILIARIO ASIGNADO</small><strong>${esc(deliveryName)}</strong></div></div>`:""}
      <div class="order-products"><small>PRODUCTOS</small><p>${items||"Sin detalle"}</p></div>${actions}</article>`;
  }
  function dateInBogota(value){if(!value)return "";return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));}
  function localToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
  function getStatsRange(){
    const today=localToday();
    if(statsPeriod==="today")return {from:today,to:today};
    if(statsPeriod==="7days"){const d=new Date(today+"T12:00:00-05:00");d.setDate(d.getDate()-6);return {from:dateInBogota(d),to:today};}
    if(statsPeriod==="month")return {from:today.slice(0,7)+"-01",to:today};
    if(statsPeriod==="custom")return {from:$("#stats-from").value||"0000-01-01",to:$("#stats-to").value||"9999-12-31"};
    return {from:"0000-01-01",to:"9999-12-31"};
  }
  function renderStatistics(){
    if(profile?.role!=="admin")return;
    const range=getStatsRange();
    const periodOrders=orders.filter(o=>{const d=dateInBogota(o.created_at);return d>=range.from&&d<=range.to;});
    const activeOrders=periodOrders.filter(o=>o.status!=="Cancelado");
    const paidOrders=orders.filter(o=>o.payment_status==="Pagado"&&dateInBogota(o.paid_at||o.created_at)>=range.from&&dateInBogota(o.paid_at||o.created_at)<=range.to);
    const pendingOrders=activeOrders.filter(o=>o.payment_status!=="Pagado");
    const sales=activeOrders.reduce((s,o)=>s+Number(o.total||0),0),collected=paidOrders.reduce((s,o)=>s+Number(o.total||0),0),pendingAmount=pendingOrders.reduce((s,o)=>s+Number(o.total||0),0),average=activeOrders.length?sales/activeOrders.length:0;
    const methods=["Transferencia","Efectivo","Datáfono","Otro"];
    const paymentTotals=methods.map(method=>({method,total:paidOrders.filter(o=>o.confirmed_payment_method===method).reduce((s,o)=>s+Number(o.total||0),0)}));
    const unclassified=paidOrders.filter(o=>!o.confirmed_payment_method).reduce((s,o)=>s+Number(o.total||0),0);
    const paymentRows=paymentTotals.concat([{method:"Sin clasificar",total:unclassified}]).filter(x=>x.total>0);
    const assigned=activeOrders.filter(o=>o.delivery_user_id),unassigned=activeOrders.filter(o=>!o.delivery_user_id);
    const driverMap={};assigned.forEach(o=>{const n=o.delivery_profile?.full_name||"Domiciliario sin nombre";driverMap[n]=(driverMap[n]||0)+1;});
    const drivers=Object.entries(driverMap).sort((x,y)=>y[1]-x[1]),maxPayment=Math.max(1,...paymentRows.map(x=>x.total)),maxDriver=Math.max(1,...drivers.map(x=>x[1]));
    const productMap={},categoryMap={},dayMap={};
    activeOrders.forEach(o=>{const day=dateInBogota(o.created_at);dayMap[day]=(dayMap[day]||0)+Number(o.total||0);(o.order_items||[]).forEach(i=>{const n=i.product_name||"Producto",cat=i.product?.category||"Otros",qty=Number(i.quantity||0),value=qty*Number(i.unit_price||0);if(!productMap[n])productMap[n]={quantity:0,total:0};productMap[n].quantity+=qty;productMap[n].total+=value;categoryMap[cat]=(categoryMap[cat]||0)+value;});});
    const topProducts=Object.entries(productMap).sort((x,y)=>y[1].quantity-x[1].quantity).slice(0,8),categories=["Proteínas","Ensaladas","Platos","Novenitas"];
    const categoryRows=categories.map(name=>({name,total:categoryMap[name]||0})).filter(x=>x.total>0),maxCategory=Math.max(1,...categoryRows.map(x=>x.total));
    const days=Object.entries(dayMap).sort((x,y)=>x[0].localeCompare(y[0])).slice(-10),maxDay=Math.max(1,...days.map(x=>x[1]));
    $("#statistics-content").innerHTML=`
      <div class="statistics-kpis"><article class="statistics-kpi featured"><span>Ventas registradas</span><strong>${money(sales)}</strong><small>${activeOrders.length} pedidos no cancelados</small></article><article class="statistics-kpi"><span>Dinero recaudado</span><strong>${money(collected)}</strong><small>${paidOrders.length} pagos confirmados</small></article><article class="statistics-kpi"><span>Por recaudar</span><strong>${money(pendingAmount)}</strong><small>${pendingOrders.length} pedidos pendientes de pago</small></article><article class="statistics-kpi"><span>Promedio por pedido</span><strong>${money(average)}</strong><small>Ticket promedio del periodo</small></article></div>
      <div class="statistics-two-columns">
       <section class="statistics-panel"><div class="statistics-panel-heading"><div><h3>Ingresos por categoría</h3><p>Valor comercial de los productos solicitados</p></div><strong>${money(sales)}</strong></div>${categoryRows.length?categoryRows.map(x=>`<div class="stat-bar-row"><div class="stat-bar-label"><span>${esc(x.name)}</span><strong>${money(x.total)}</strong></div><div class="stat-bar-track"><span style="width:${Math.max(2,x.total/maxCategory*100)}%"></span></div></div>`).join(""):'<p class="empty-state compact">Aún no hay ventas en este periodo.</p>'}</section>
       <section class="statistics-panel"><div class="statistics-panel-heading"><div><h3>Recaudo por medio de pago</h3><p>Solo pagos marcados como recibidos</p></div><strong>${money(collected)}</strong></div>${paymentRows.length?paymentRows.map(x=>`<div class="stat-bar-row"><div class="stat-bar-label"><span>${esc(x.method)}</span><strong>${money(x.total)}</strong></div><div class="stat-bar-track"><span style="width:${Math.max(2,x.total/maxPayment*100)}%"></span></div></div>`).join(""):'<p class="empty-state compact">Aún no hay pagos confirmados en este periodo.</p>'}${unclassified?'<p class="statistics-note">Hay pagos sin medio confirmado. Puedes clasificarlos desde Pedidos.</p>':""}</section>
      </div>
      <section class="statistics-panel products-statistics"><div class="statistics-panel-heading"><div><h3>Ventas por día</h3><p>Valor de los pedidos no cancelados</p></div><strong>${days.length} días</strong></div>${days.length?days.map(([day,total])=>`<div class="stat-bar-row"><div class="stat-bar-label"><span>${new Date(day+"T12:00:00").toLocaleDateString("es-CO",{day:"2-digit",month:"short"})}</span><strong>${money(total)}</strong></div><div class="stat-bar-track"><span style="width:${Math.max(2,total/maxDay*100)}%"></span></div></div>`).join(""):'<p class="empty-state compact">No hay ventas para graficar.</p>'}</section>
      <div class="statistics-two-columns">
       <section class="statistics-panel"><div class="statistics-panel-heading"><div><h3>Control de domicilios</h3><p>Pedidos del periodo seleccionado</p></div><strong>${assigned.length+unassigned.length}</strong></div><div class="delivery-summary"><div><span>Asignados</span><strong>${assigned.length}</strong></div><div><span>Sin asignar</span><strong>${unassigned.length}</strong></div></div>${drivers.length?'<h4>Pedidos por domiciliario</h4>'+drivers.map(([name,count])=>`<div class="stat-bar-row"><div class="stat-bar-label"><span>${esc(name)}</span><strong>${count} pedidos</strong></div><div class="stat-bar-track delivery-track"><span style="width:${Math.max(3,count/maxDriver*100)}%"></span></div></div>`).join(""):'<p class="empty-state compact">Todavía no hay domicilios asignados.</p>'}</section>
       <section class="statistics-panel"><div class="statistics-panel-heading"><div><h3>Productos más vendidos</h3><p>Unidades y valor generado</p></div><strong>${topProducts.length} productos</strong></div>${topProducts.length?'<div class="top-products-list">'+topProducts.map(([name,d],i)=>`<div class="top-product-row"><span class="top-product-rank">${i+1}</span><strong>${esc(name)}</strong><span>${d.quantity} uds.</span><b>${money(d.total)}</b></div>`).join("")+'</div>':'<p class="empty-state compact">Aún no hay productos vendidos en este periodo.</p>'}</section>
      </div><p class="statistics-footnote">Las ventas usan pedidos no cancelados y fecha de creación. El recaudo usa la fecha de confirmación del pago. Los componentes de los platos se controlan en inventario y no se contabilizan dos veces como ingresos.</p>`;
  }
  async function loadInventory(){
    if(!db||profile?.role!=="admin")return;
    const [{data,error},{data:movementData,error:movementError}]=await Promise.all([
      db.from("inventory_items").select("id,name,category,unit,initial_stock,current_stock,is_configured,updated_at").order("category").order("name"),
      db.from("inventory_movements").select("id,inventory_item_id,movement_type,quantity_delta,note,created_at,order_id").order("created_at",{ascending:true}).limit(2000)
    ]);
    if(error||movementError){console.error(error||movementError);$("#inventory-content").innerHTML='<p class="empty-state">No fue posible consultar el inventario y sus movimientos.</p>';return;}
    inventoryItems=data||[];inventoryMovements=movementData||[];renderInventory();
  }
  function renderInventory(){
    if(profile?.role!=="admin")return;
    const categories=["Proteínas","Ensaladas","Guarniciones","Novenitas"],configured=inventoryItems.filter(x=>x.is_configured).length;
    const cards=categories.map(category=>{
      const rows=inventoryItems.filter(x=>x.category===category),initial=rows.reduce((s,x)=>s+Number(x.initial_stock||0),0),current=rows.reduce((s,x)=>s+Number(x.current_stock||0),0),mixed=category==="Novenitas",active=selectedInventoryCategory===category;
      return `<button type="button" class="inventory-summary-card inventory-category-select ${active?"selected":""}" data-inventory-category="${esc(category)}" aria-pressed="${active}"><span>${esc(category)}</span><strong>${mixed?rows.filter(x=>x.is_configured&&Number(x.current_stock)>0).length:current.toLocaleString("es-CO")} <small>${mixed?"referencias con stock":esc(rows[0]?.unit||"")}</small></strong><small>${mixed?rows.length+" referencias":"Inicial: "+initial.toLocaleString("es-CO")+" · "+rows.length+" referencias"}</small><span class="inventory-card-hint">Ver análisis <span aria-hidden="true">→</span></span></button>`;
    }).join("");
    const stockByName=Object.fromEntries(inventoryItems.map(x=>[x.name,Number(x.current_stock||0)]));
    const sumNames=names=>names.reduce((sum,name)=>sum+(stockByName[name]||0),0);
    const plate1=Math.min(sumNames(["Capón relleno envuelto en tocineta","Medallones de cerdo","Pechuga Cordon Bleu"]),sumNames(["Ensalada rusa","Ensalada colombiana"]),sumNames(["Papa amarilla en cascos","Papa a la francesa","Pan navideño","Rapiyuca"]));
    const plate2=Math.min(Math.floor(sumNames(["Capón relleno envuelto en tocineta","Medallones de cerdo","Pechuga Cordon Bleu"])/2),sumNames(["Ensalada rusa","Ensalada colombiana"]),sumNames(["Papa amarilla en cascos","Papa a la francesa","Pan navideño","Rapiyuca"]));
    const plate3=Math.min(Math.floor(sumNames(["Capón relleno envuelto en tocineta","Medallones de cerdo","Pechuga Cordon Bleu","Lomo relleno","Pollo relleno"])/2),sumNames(["Ensalada rusa","Ensalada colombiana"]),sumNames(["Papa amarilla en cascos","Papa a la francesa","Pan navideño","Rapiyuca"]));
    const groups=categories.map(category=>{const rows=inventoryItems.filter(x=>x.category===category);return `<section class="inventory-category"><div class="inventory-category-heading"><h3>${esc(category)}</h3><span>${rows.filter(x=>x.is_configured).length}/${rows.length} configurados</span></div><div class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>Producto</th><th>Unidad</th><th>Inventario inicial</th><th>Disponible</th><th>Actualizar existencia</th></tr></thead><tbody>${rows.map(item=>`<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.unit)}</td><td>${item.is_configured?Number(item.initial_stock).toLocaleString("es-CO"):"—"}</td><td><strong class="${Number(item.current_stock)<=3?"inventory-low":""}">${item.is_configured?Number(item.current_stock).toLocaleString("es-CO"):"Sin registrar"}</strong></td><td><form class="inventory-update-form" data-inventory-form="${item.id}"><input name="quantity" type="number" min="0" step="1" required value="${item.is_configured?Number(item.current_stock):""}" placeholder="Cantidad"><input name="note" type="text" maxlength="120" placeholder="Motivo (opcional)"><button class="btn btn-outline btn-small" type="submit">Guardar</button></form></td></tr>`).join("")}</tbody></table></div></section>`;}).join("");
    $("#inventory-content").innerHTML=`<div class="inventory-summary-grid">${cards}<article class="inventory-summary-card"><span>Platos preparados</span><strong>1: ${plate1} · 2: ${plate2} · 3: ${plate3}</strong><small>Capacidad estimada según proteínas, ensaladas y guarniciones disponibles</small></article></div><div class="inventory-progress-note">${configured} de ${inventoryItems.length} referencias tienen inventario inicial registrado. Los pedidos nuevos descuentan automáticamente porciones, unidades o combos. Los ajustes posteriores quedan registrados.</div><div id="inventory-analytics">${renderInventoryAnalytics(selectedInventoryCategory)}</div>${groups}`;
    $("#inventory-content").querySelectorAll("[data-inventory-form]").forEach(form=>form.addEventListener("submit",saveInventoryStock));
    $("#inventory-content").querySelectorAll("[data-inventory-category]").forEach(button=>button.addEventListener("click",()=>{selectedInventoryCategory=button.dataset.inventoryCategory;renderInventory();}));
  }
  function renderInventoryAnalytics(category){
    const rows=inventoryItems.filter(x=>x.category===category),palette=["#b88b45","#557b65","#607da7","#bb765d","#8872a5","#6c9b9b","#c49c63","#87915b"];
    if(!rows.length)return '<p class="empty-state">No hay referencias para esta categoría.</p>';
    const metrics=rows.map(item=>{
      const movements=inventoryMovements.filter(m=>m.inventory_item_id===item.id),reserved=movements.filter(m=>m.movement_type==="reserve").reduce((s,m)=>s+Math.abs(Number(m.quantity_delta)),0),released=movements.filter(m=>m.movement_type==="release").reduce((s,m)=>s+Math.abs(Number(m.quantity_delta)),0),sold=Math.max(0,reserved-released);
      return {...item,initial:Number(item.initial_stock||0),current:Number(item.current_stock||0),sold,reserved,released};
    });
    const max=Math.max(1,...metrics.map(x=>Math.max(x.initial,x.sold,x.current))),chartWidth=Math.max(680,metrics.length*138),barW=22;
    const bars=metrics.map((item,i)=>{
      const x=68+i*138,base=235,scale=155/max;
      const vals=[{key:"Inicial",value:item.initial,color:"#c5a36a"},{key:"Vendidas",value:item.sold,color:"#668b75"},{key:"Disponibles",value:item.current,color:"#617fa6"}];
      return vals.map((v,j)=>{const bh=v.value*scale,bx=x+j*27,by=base-bh;return `<rect x="${bx}" y="${by}" width="${barW}" height="${Math.max(1,bh)}" rx="5" fill="${v.color}"><title>${esc(item.name)} · ${v.key}: ${v.value} ${esc(item.unit)}</title></rect><text x="${bx+barW/2}" y="${Math.max(16,by-7)}" text-anchor="middle" class="chart-value">${v.value}</text>`;}).join("")+`<text x="${x+40}" y="258" text-anchor="middle" class="chart-label">${esc(item.name.length>18?item.name.slice(0,16)+"…":item.name)}</text>`;
    }).join("");
    const totalCurrent=metrics.reduce((s,x)=>s+x.current,0),totalInitial=metrics.reduce((s,x)=>s+x.initial,0),totalSold=metrics.reduce((s,x)=>s+x.sold,0);
    let offset=0;const slices=metrics.map((item,i)=>{const pct=totalCurrent?item.current/totalCurrent*100:0,from=offset;offset+=pct;return {item,pct,color:palette[i%palette.length],from,to:offset};});
    const pie=slices.map(s=>`${s.color} ${s.from}% ${s.to}%`).join(",");
    const dateMap={};const categoryIds=new Set(rows.map(x=>x.id));
    inventoryMovements.filter(m=>categoryIds.has(m.inventory_item_id)&&m.note!=="Registro o actualización de inventario inicial").forEach(m=>{const day=String(m.created_at).slice(0,10);dateMap[day]=(dateMap[day]||0)+Number(m.quantity_delta||0);});
    const dayRows=Object.entries(dateMap).sort((a,b)=>a[0].localeCompare(b[0]));
    let running=totalCurrent-dayRows.reduce((s,x)=>s+x[1],0);
    const points=[{day:"Inventario inicial",value:Math.max(0,running)}];
    dayRows.forEach(([day,delta])=>{running+=delta;points.push({day,value:Math.max(0,running)});});
    const series=points;
    const W=680,H=230,pad=36,maxLine=Math.max(1,...series.map(x=>x.value)),coords=series.map((p,i)=>({x:pad+(series.length===1?(W-pad*2)/2:i*(W-pad*2)/(series.length-1)),y:H-pad-(p.value/maxLine)*(H-pad*2),...p}));
    const line=coords.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
    const area=line+` L ${coords[coords.length-1].x} ${H-pad} L ${coords[0].x} ${H-pad} Z`;
    const trendSvg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de existencias de ${esc(category)}"><defs><linearGradient id="inventory-area-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#688c78" stop-opacity=".42"/><stop offset="100%" stop-color="#688c78" stop-opacity=".02"/></linearGradient></defs><path d="${area}" fill="url(#inventory-area-gradient)"/><path d="${line}" fill="none" stroke="#557b65" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${coords.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#557b65"><title>${p.day}: ${p.value} unidades disponibles</title></circle>`).join("")}<text x="${pad}" y="18" class="chart-axis-label">${maxLine.toLocaleString("es-CO")} ${esc(rows[0]?.unit||"unidades")}</text><text x="${pad}" y="${H-7}" class="chart-axis-label">${esc(series[0].day)}</text><text x="${W-pad}" y="${H-7}" text-anchor="end" class="chart-axis-label">${esc(series[series.length-1].day)}</text></svg>`;
    return `<section class="inventory-analytics-panel"><div class="inventory-analytics-heading"><div><p class="eyebrow">Análisis por referencia</p><h3>${esc(category)}</h3><p>Comparación de cantidades iniciales, ventas y existencias actuales</p></div><span class="inventory-live-label"><i></i> Datos en vivo</span></div>
      <div class="inventory-chart-kpis"><div><span>Inventario inicial</span><strong>${totalInitial.toLocaleString("es-CO")}</strong></div><div><span>Unidades vendidas netas</span><strong>${totalSold.toLocaleString("es-CO")}</strong></div><div><span>Disponibles ahora</span><strong>${totalCurrent.toLocaleString("es-CO")}</strong></div></div>
      <div class="inventory-charts-grid"><article class="inventory-chart-card inventory-chart-wide"><div class="inventory-chart-title"><h4>Inicial vs. vendidas vs. disponibles</h4><p>Comparativo por referencia · ${esc(rows[0]?.unit||"unidades")}</p></div><div class="inventory-chart-scroll"><svg viewBox="0 0 ${chartWidth} 285" role="img" aria-label="Gráfico de columnas por referencia"><line x1="48" y1="235" x2="${chartWidth-12}" y2="235" stroke="#e8e2d8"/>${bars}</svg></div><div class="inventory-chart-legend"><span><i style="background:#c5a36a"></i>Inicial</span><span><i style="background:#668b75"></i>Vendidas netas</span><span><i style="background:#617fa6"></i>Disponibles</span></div></article>
      <article class="inventory-chart-card"><div class="inventory-chart-title"><h4>Composición del stock</h4><p>Participación de cada referencia disponible</p></div><div class="inventory-donut-wrap"><div class="inventory-donut" style="background:${totalCurrent?"conic-gradient("+pie+")":"#eee"}"><div><strong>${totalCurrent.toLocaleString("es-CO")}</strong><small>disponibles</small></div></div></div><div class="inventory-pie-legend">${slices.map(s=>`<div><i style="background:${s.color}"></i><span>${esc(s.item.name)}</span><strong>${s.pct.toFixed(1)}%</strong></div>`).join("")}</div></article>
      <article class="inventory-chart-card inventory-chart-wide"><div class="inventory-chart-title"><h4>Evolución de existencias</h4><p>Saldo de inventario reconstruido a partir de los movimientos registrados</p></div><div class="inventory-trend-chart">${trendSvg}</div><p class="inventory-chart-footnote">${dayRows.length?dayRows.length+" fechas con movimientos registrados.":"Aún no hay ventas ni ajustes históricos posteriores al registro inicial."} Las líneas se actualizan al registrar pedidos, cancelaciones o ajustes.</p></article></div>
      <p class="inventory-chart-footnote">Las unidades vendidas netas corresponden a reservas por pedidos menos devoluciones por cancelación. Los ajustes manuales no se cuentan como ventas.</p>
    </section>`;
  }
  async function saveInventoryStock(e){
    e.preventDefault();if(profile?.role!=="admin")return;
    const form=e.currentTarget,id=form.dataset.inventoryForm,item=inventoryItems.find(x=>x.id===id),data=new FormData(form),quantity=Number(data.get("quantity")),note=String(data.get("note")||"");
    if(!item||!Number.isFinite(quantity)||quantity<0){notify("Ingresa una cantidad válida.",true);return;}
    const button=form.querySelector("button");button.disabled=true;button.textContent="Guardando…";
    const delta=quantity-Number(item.current_stock||0);if(item.is_configured&&delta===0){notify("La existencia no cambió.");button.disabled=false;button.textContent="Guardar";return;}const result=!item.is_configured?await db.rpc("admin_set_inventory_stock",{p_item_id:id,p_quantity:quantity}):await db.rpc("admin_adjust_inventory",{p_item_id:id,p_delta:delta,p_note:note||"Ajuste de existencia física"});
    if(result.error){notify(result.error.message,true);button.disabled=false;button.textContent="Guardar";return;}
    notify("Inventario actualizado para "+item.name+".");await loadInventory();
  }
  function slug(s){return String(s||"").toLowerCase().replaceAll(" ","-").replaceAll("ó","o").replaceAll("á","a");}
  function formatDate(d){return d?new Date(d+"T12:00:00").toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"}):"Por definir";}
  async function updateOrder(id,status) {
    const {error}=await db.from("orders").update({status}).eq("id",id);
    if(error){notify(error.message,true);return;} notify("Estado del pedido actualizado.");await loadOrders();
  }
  async function confirmPayment(id) {
    const order=orders.find(o=>String(o.id)===String(id));if(!order)return;
    const modal=document.createElement("div");modal.className="modal-backdrop payment-backdrop";
    modal.innerHTML=`<section class="modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
      <button class="icon-button modal-close" type="button" aria-label="Cerrar">×</button><p class="eyebrow">Control de recaudo</p>
      <h2 id="payment-modal-title">${order.payment_status==="Pagado"?"Actualizar pago":"Confirmar pago recibido"}</h2>
      <p class="muted">Pedido ${esc(order.order_number)} · Total ${money(order.total)}</p>
      <form class="form-grid"><label class="span-2">¿Por cuál medio recibiste el dinero?
        <select name="confirmed_payment_method" required><option value="">Selecciona el medio confirmado</option>
        <option value="Transferencia" ${order.confirmed_payment_method==="Transferencia"?"selected":""}>Transferencia</option>
        <option value="Efectivo" ${order.confirmed_payment_method==="Efectivo"?"selected":""}>Efectivo</option>
        <option value="Datáfono" ${order.confirmed_payment_method==="Datáfono"?"selected":""}>Datáfono</option>
        <option value="Otro" ${order.confirmed_payment_method==="Otro"?"selected":""}>Otro</option></select></label>
        <button class="btn btn-primary btn-full span-2" type="submit">${order.payment_status==="Pagado"?"Guardar medio de pago":"Confirmar dinero recibido"}</button></form></section>`;
    document.body.appendChild(modal);const close=()=>modal.remove();
    modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest(".modal-close"))close();});
    modal.querySelector("form").addEventListener("submit",async e=>{
      e.preventDefault();const method=new FormData(e.currentTarget).get("confirmed_payment_method");if(!method)return;
      const button=e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;button.textContent="Guardando…";
      const {error}=await db.rpc("admin_confirm_order_payment",{p_order_id:id,p_method:method});
      if(error){notify(error.message,true);button.disabled=false;button.textContent="Intentar nuevamente";return;}
      close();notify("Pago registrado: "+method+".");await loadOrders();
    });
  }
  async function assignDelivery(id) {
    const {data,error}=await db.from("profiles").select("id,full_name").eq("role","delivery").order("full_name");
    if(error||!data?.length){notify("No hay domiciliarios registrados. Crea primero un perfil en Gestión del equipo.",true);return;}
    const modal=document.createElement("div");
    modal.className="modal-backdrop";
    modal.innerHTML='<section class="modal team-modal" role="dialog" aria-modal="true"><button class="icon-button modal-close" type="button" aria-label="Cerrar">×</button><p class="eyebrow">Logística Hangary</p><h2>Asignar domiciliario</h2><form class="form-grid"><label class="span-2">Selecciona el responsable<select name="delivery_id" required><option value="">Elige un domiciliario</option>'+data.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.full_name)+'</option>').join("")+'</select></label><button class="btn btn-primary btn-full span-2" type="submit">Asignar pedido</button></form></section>';
    document.body.appendChild(modal);
    const close=()=>modal.remove();
    modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest(".modal-close"))close();});
    modal.querySelector("form").addEventListener("submit",async e=>{
      e.preventDefault();const person=data.find(x=>x.id===new FormData(e.currentTarget).get("delivery_id"));if(!person)return;
      const submit=e.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Asignando…";
      const {error:upError}=await db.from("orders").update({delivery_user_id:person.id,status:"Asignado"}).eq("id",id);
      if(upError){notify(upError.message,true);submit.disabled=false;submit.textContent="Asignar pedido";return;}
      close();notify("Pedido asignado a "+person.full_name+".");await loadOrders();
    });
  }

  async function loadDeliveryTeam() {
    if(!db||profile?.role!=="admin")return;
    const list=$("#delivery-team-list");
    list.innerHTML='<div class="loading">Consultando equipo…</div>';
    const {data,error}=await db.functions.invoke("manage-delivery-team",{body:{action:"list"}});
    if(error||data?.error){list.innerHTML='<p class="empty-state">No fue posible cargar los domiciliarios.</p>';return;}
    const team=data.team||[];
    list.innerHTML=team.length?team.map(person=>'<article class="team-member"><div><strong>'+esc(person.full_name)+'</strong><span>'+esc(person.email||"Sin correo")+'</span></div><span class="team-status '+(person.active?"active":"pending")+'">'+(person.active?"Acceso habilitado":"Revisar cuenta")+'</span></article>').join(""):'<p class="empty-state">Aún no hay domiciliarios registrados.</p>';
  }

  async function createDeliveryProfile(e) {
    e.preventDefault();if(profile?.role!=="admin")return;
    const form=e.currentTarget,button=form.querySelector('button[type="submit"]');
    const values=Object.fromEntries(new FormData(form).entries());
    button.disabled=true;button.textContent="Creando perfil…";
    const {data,error}=await db.functions.invoke("manage-delivery-team",{body:{action:"create",full_name:values.full_name,email:values.email,password:values.password}});
    button.disabled=false;button.textContent="Crear domiciliario";
    let errorMessage=data?.error;
    if(error){
      try{const payload=await error.context?.json();errorMessage=payload?.error||error.message;}catch{errorMessage=error.message;}
    }
    if(error||data?.error){notify(errorMessage||"No se pudo crear el perfil.",true);return;}
    form.reset();notify(data.message||"Cuenta de domiciliario creada.");await loadDeliveryTeam();
  }

  // UI events
  $("#category-tabs").addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(!b)return;document.querySelectorAll("[data-category]").forEach(x=>x.classList.toggle("active",x===b));renderProducts(b.dataset.category);});
  $("#cart-open").addEventListener("click",showCart);$("#banner-cart").addEventListener("click",showCart);
  $("#cart-close").addEventListener("click",hideCart);$("#cart-overlay").addEventListener("click",hideCart);
  $("#checkout-open").addEventListener("click",()=>{hideCart();openModal("checkout-modal");$("#checkout-total").textContent=money(total());});
  $("#checkout-form").addEventListener("submit",submitOrder);
  $("#success-back-to-store").addEventListener("click",closeOrderSuccess);
  $("#order-success").addEventListener("click",e=>{if(e.target===$("#order-success"))closeOrderSuccess();});
  $("#staff-login-open").addEventListener("click",()=>openModal("login-modal"));$("#login-form").addEventListener("submit",login);$("#delivery-team-form").addEventListener("submit",createDeliveryProfile);$("#refresh-team").addEventListener("click",loadDeliveryTeam);
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.classList.add("hidden");}));
  $("#logout-button").addEventListener("click",async()=>{if(db)await db.auth.signOut();showStore();notify("Sesión cerrada.");});
  $("#back-to-store").addEventListener("click",e=>{e.preventDefault();showStore();});
  $("#refresh-orders").addEventListener("click",loadOrders);
  $("#refresh-inventory").addEventListener("click",loadInventory);
  $("#orders-tabs").addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;orderFilter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));renderDashboard();});
  $("#admin-navigation").addEventListener("click",e=>{const b=e.target.closest("[data-staff-view]");if(!b||profile?.role!=="admin")return;const view=b.dataset.staffView;$("#orders-view").classList.toggle("hidden",view!=="orders");$("#statistics-view").classList.toggle("hidden",view!=="statistics");$("#inventory-view").classList.toggle("hidden",view!=="inventory");document.querySelectorAll("[data-staff-view]").forEach(x=>x.classList.toggle("active",x===b));$("#dashboard-title").textContent=view==="statistics"?"Estadísticas y ventas":view==="inventory"?"Control de inventario":"Gestión de pedidos";$("#refresh-orders").classList.toggle("hidden",view!=="orders");if(view==="statistics")renderStatistics();if(view==="inventory")loadInventory();});
  $("#stats-period").addEventListener("change",e=>{statsPeriod=e.target.value;$("#stats-custom-dates").classList.toggle("hidden",statsPeriod!=="custom");renderStatistics();});
  ["stats-from","stats-to"].forEach(id=>$("#"+id).addEventListener("change",renderStatistics));
  $("#year").textContent=new Date().getFullYear();
  const minDate=new Date();minDate.setMinutes(minDate.getMinutes()-minDate.getTimezoneOffset());$("#checkout-form [name=delivery_date]").min=minDate.toISOString().slice(0,10);
  renderCart();loadProducts();
  if(db)db.auth.getSession().then(({data})=>{if(data.session)loadStaff();});
})();