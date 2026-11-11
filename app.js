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
  let statsPeriod = "all";
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
    $("#orders-view").classList.remove("hidden");$("#statistics-view").classList.add("hidden");
    document.querySelectorAll("[data-staff-view]").forEach(b=>b.classList.toggle("active",b.dataset.staffView==="orders"));
    if(prof.role==="admin")await loadDeliveryTeam();
    await loadOrders();
  }
  function showStore(){
    $("#staff-app").classList.add("hidden");$("#storefront").classList.remove("hidden");
    $(".site-header").classList.remove("hidden");$(".site-footer").classList.remove("hidden");
    currentUser=null;profile=null;orders=[];orderFilter="Todos";
  }
  async function loadOrders() {
    if(!db||!profile)return;
    $("#orders-list").innerHTML='<div class="loading">Actualizando pedidos…</div>';
    let q=db.from("orders").select("*,delivery_profile:profiles!orders_delivery_user_id_fkey(full_name),order_items(id,quantity,unit_price,product_name,options)").order("created_at",{ascending:false});
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
    const paidOrders=activeOrders.filter(o=>o.payment_status==="Pagado");
    const pendingOrders=activeOrders.filter(o=>o.payment_status!=="Pagado");
    const sales=activeOrders.reduce((s,o)=>s+Number(o.total||0),0);
    const collected=paidOrders.reduce((s,o)=>s+Number(o.total||0),0);
    const pendingAmount=pendingOrders.reduce((s,o)=>s+Number(o.total||0),0);
    const average=activeOrders.length?sales/activeOrders.length:0;
    const methods=["Transferencia","Efectivo","Datáfono","Otro"];
    const paymentTotals=methods.map(method=>({method,total:paidOrders.filter(o=>o.confirmed_payment_method===method).reduce((s,o)=>s+Number(o.total||0),0)}));
    const unclassified=paidOrders.filter(o=>!o.confirmed_payment_method).reduce((s,o)=>s+Number(o.total||0),0);
    const paymentRows=paymentTotals.concat([{method:"Sin clasificar",total:unclassified}]).filter(x=>x.total>0);
    const assigned=activeOrders.filter(o=>o.delivery_user_id),unassigned=activeOrders.filter(o=>!o.delivery_user_id);
    const driverMap={};assigned.forEach(o=>{const n=o.delivery_profile?.full_name||"Domiciliario sin nombre";driverMap[n]=(driverMap[n]||0)+1;});
    const drivers=Object.entries(driverMap).sort((x,y)=>y[1]-x[1]),maxPayment=Math.max(1,...paymentRows.map(x=>x.total)),maxDriver=Math.max(1,...drivers.map(x=>x[1]));
    const productMap={};activeOrders.forEach(o=>(o.order_items||[]).forEach(i=>{const n=i.product_name||"Producto";if(!productMap[n])productMap[n]={quantity:0,total:0};productMap[n].quantity+=Number(i.quantity||0);productMap[n].total+=Number(i.quantity||0)*Number(i.unit_price||0);}));
    const topProducts=Object.entries(productMap).sort((x,y)=>y[1].quantity-x[1].quantity).slice(0,6);
    $("#statistics-content").innerHTML=`
      <div class="statistics-kpis">
        <article class="statistics-kpi featured"><span>Ventas registradas</span><strong>${money(sales)}</strong><small>${activeOrders.length} pedidos no cancelados</small></article>
        <article class="statistics-kpi"><span>Dinero recaudado</span><strong>${money(collected)}</strong><small>${paidOrders.length} pagos confirmados</small></article>
        <article class="statistics-kpi"><span>Por recaudar</span><strong>${money(pendingAmount)}</strong><small>${pendingOrders.length} pedidos pendientes de pago</small></article>
        <article class="statistics-kpi"><span>Promedio por pedido</span><strong>${money(average)}</strong><small>Ticket promedio del periodo</small></article>
      </div>
      <div class="statistics-two-columns">
        <section class="statistics-panel"><div class="statistics-panel-heading"><div><h3>Recaudo por medio de pago</h3><p>Solo pagos marcados como recibidos</p></div><strong>${money(collected)}</strong></div>
          ${paymentRows.length?paymentRows.map(x=>`<div class="stat-bar-row"><div class="stat-bar-label"><span>${esc(x.method)}</span><strong>${money(x.total)}</strong></div><div class="stat-bar-track"><span style="width:${Math.max(2,x.total/maxPayment*100)}%"></span></div></div>`).join(""):'<p class="empty-state compact">Aún no hay pagos confirmados en este periodo.</p>'}
          ${unclassified?'<p class="statistics-note">Hay pagos anteriores sin medio confirmado. Puedes clasificarlos desde Pedidos.</p>':""}
        </section>
        <section class="statistics-panel"><div class="statistics-panel-heading"><div><h3>Control de domicilios</h3><p>Pedidos del periodo seleccionado</p></div><strong>${assigned.length+unassigned.length}</strong></div>
          <div class="delivery-summary"><div><span>Asignados</span><strong>${assigned.length}</strong></div><div><span>Sin asignar</span><strong>${unassigned.length}</strong></div></div>
          ${drivers.length?'<h4>Pedidos por domiciliario</h4>'+drivers.map(([name,count])=>`<div class="stat-bar-row"><div class="stat-bar-label"><span>${esc(name)}</span><strong>${count} pedidos</strong></div><div class="stat-bar-track delivery-track"><span style="width:${Math.max(3,count/maxDriver*100)}%"></span></div></div>`).join(""):'<p class="empty-state compact">Todavía no hay domicilios asignados.</p>'}
        </section>
      </div>
      <section class="statistics-panel products-statistics"><div class="statistics-panel-heading"><div><h3>Productos más vendidos</h3><p>Clasificación por unidades solicitadas</p></div><strong>${topProducts.length} productos</strong></div>
        ${topProducts.length?'<div class="top-products-list">'+topProducts.map(([name,d],i)=>`<div class="top-product-row"><span class="top-product-rank">${i+1}</span><strong>${esc(name)}</strong><span>${d.quantity} unidades</span><b>${money(d.total)}</b></div>`).join("")+'</div>':'<p class="empty-state compact">Aún no hay productos vendidos en este periodo.</p>'}
      </section>
      <p class="statistics-footnote">Las ventas se calculan con pedidos no cancelados. El recaudo incluye pedidos marcados como Pagados. El filtro toma como referencia la fecha de creación del pedido.</p>`;
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
      const updates={confirmed_payment_method:method};
      if(order.payment_status!=="Pagado"){updates.payment_status="Pagado";updates.paid_at=new Date().toISOString();updates.paid_by=currentUser.id;}
      const {error}=await db.from("orders").update(updates).eq("id",id);
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
  $("#orders-tabs").addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;orderFilter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));renderDashboard();});
  $("#admin-navigation").addEventListener("click",e=>{const b=e.target.closest("[data-staff-view]");if(!b||profile?.role!=="admin")return;const view=b.dataset.staffView;$("#orders-view").classList.toggle("hidden",view!=="orders");$("#statistics-view").classList.toggle("hidden",view!=="statistics");document.querySelectorAll("[data-staff-view]").forEach(x=>x.classList.toggle("active",x===b));$("#dashboard-title").textContent=view==="statistics"?"Estadísticas y ventas":"Gestión de pedidos";$("#refresh-orders").classList.toggle("hidden",view==="statistics");if(view==="statistics")renderStatistics();});
  $("#stats-period").addEventListener("change",e=>{statsPeriod=e.target.value;$("#stats-custom-dates").classList.toggle("hidden",statsPeriod!=="custom");renderStatistics();});
  ["stats-from","stats-to"].forEach(id=>$("#"+id).addEventListener("change",renderStatistics));
  $("#year").textContent=new Date().getFullYear();
  const minDate=new Date();minDate.setMinutes(minDate.getMinutes()-minDate.getTimezoneOffset());$("#checkout-form [name=delivery_date]").min=minDate.toISOString().slice(0,10);
  renderCart();loadProducts();
  if(db)db.auth.getSession().then(({data})=>{if(data.session)loadStaff();});
})();