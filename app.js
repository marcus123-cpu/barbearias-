const STORE_KEY = "rl-barbearia-state-v2";
const ADMIN_PASSWORD = "rl123";
const SESSION_TIMEOUT_DAYS = 20;
const TERMS_VERSION = "2026-08-16";
const PRIVACY_VERSION = "2026-08-16";
const isAdminRoute = location.pathname.replace(/\/$/, "").endsWith("/admin");
const ASSET_BASE = isAdminRoute ? "../assets/" : "assets/";
const COMPANY_PHOTO = `${ASSET_BASE}723131300_17888375571564268_3687150447483075437_n.jpg`;

const seed = {
  client: null,
  lastAccessAt: null,
  clients: [],
  services: [
    { id: "corte", name: "Corte masculino", price: 35, duration: 40 },
    { id: "barba", name: "Barba", price: 25, duration: 30 },
    { id: "combo", name: "Corte + barba", price: 55, duration: 60 },
  ],
  barbers: [
    { id: "barber-left", name: "Barbeiro RL", role: "Profissional", photo: COMPANY_PHOTO, position: "22% center" },
    { id: "barber-right", name: "Barbeiro RL", role: "Profissional", photo: COMPANY_PHOTO, position: "78% center" },
    { id: "any", name: "Qualquer profissional disponível", role: "Primeiro horário livre", photo: "" },
  ],
  business: {
    name: "RL Barbearia",
    address: "Av. Rosalvo Aderaldo, 170 - Centro",
    whatsapp: "5517997782830",
    whatsappAlt: "5511990212577",
    instagram: "@rl_barbearia_",
    open: "09:00",
    close: "19:00",
    interval: 30,
    blocked: [],
  },
  appointments: [],
};

let state = loadState();
let authStep = "welcome";
let clientScreen = "home";
let bookingStep = "phone";
let adminPage = "overview";
let modal = null;
let legalDoc = null;
let phoneDraft = "";
let booking = initialBooking();

function initialBooking() {
  return {
    serviceId: "",
    barberId: "",
    date: todayISO(),
    time: "",
  };
}

function todayISO(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function isExpiredAccess(lastAccessAt) {
  if (!lastAccessAt) return false;
  const accessTime = new Date(lastAccessAt).getTime();
  if (Number.isNaN(accessTime)) return true;
  const elapsed = Date.now() - accessTime;
  return elapsed > SESSION_TIMEOUT_DAYS * 24 * 60 * 60 * 1000;
}

function loadState() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return structuredClone(seed);
  try {
    const saved = JSON.parse(raw);
    const next = {
      ...structuredClone(seed),
      ...saved,
      business: structuredClone(seed).business,
    };
    next.barbers = structuredClone(seed).barbers;
    next.appointments = next.appointments
      .filter((item) => item.id !== "apt-1" && item.id !== "apt-2")
      .map((item) => ({
        ...item,
        barberId: item.barberId === "lucas" ? "barber-left" : item.barberId === "rafael" ? "barber-right" : item.barberId,
      }));
    next.clients = next.clients.filter((item) => item.phone !== "11988887777" && item.phone !== "11977776666");
    if (next.client && isExpiredAccess(next.lastAccessAt)) {
      next.client = null;
      next.lastAccessAt = null;
    }
    return next;
  } catch {
    return structuredClone(seed);
  }
}

function saveState(touchAccess = true) {
  if (touchAccess) state.lastAccessAt = new Date().toISOString();
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

if (state.client) saveState();

function money(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fullDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function shortDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function serviceById(id) {
  return state.services.find((item) => item.id === id);
}

function barberById(id) {
  return state.barbers.find((item) => item.id === id);
}

function normalizedStatus(status) {
  return String(status || "").toLowerCase().replace(/[\s_-]/g, "");
}

function isCanceledStatus(status) {
  return ["canceled", "cancelled", "cancelado"].includes(normalizedStatus(status));
}

function isCompletedStatus(status) {
  return ["concluido", "concluído", "completed", "finalizado"].includes(normalizedStatus(status));
}

function isNoShowStatus(status) {
  return ["naocompareceu", "não compareceu", "noshow"].includes(normalizedStatus(status));
}

function canCancelAppointment(item) {
  return !isCanceledStatus(item.status) && !isCompletedStatus(item.status) && !isNoShowStatus(item.status);
}

function isInactiveAppointment(item) {
  return isCanceledStatus(item.status) || isCompletedStatus(item.status) || isNoShowStatus(item.status);
}

function clientByPhone(phone) {
  return state.clients.find((item) => item.phone === cleanPhone(phone));
}

function cleanPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function upsertClient(client) {
  const phone = cleanPhone(client.phone);
  const index = state.clients.findIndex((item) => item.phone === phone);
  const previous = index >= 0 ? state.clients[index] : {};
  const next = { ...previous, ...client, phone, birth: client.birth || previous.birth || "" };
  if (index >= 0) state.clients[index] = next;
  else state.clients.push(next);
}

function availableTimes(date, barberId) {
  if (barberId === "any") {
    const realBarbers = state.barbers.filter((item) => item.id !== "any");
    return [...new Set(realBarbers.flatMap((barber) => availableTimes(date, barber.id)))].sort();
  }

  const times = [];
  const cursor = new Date(`${date}T${state.business.open}:00`);
  const close = new Date(`${date}T${state.business.close}:00`);

  while (cursor < close) {
    const time = cursor.toTimeString().slice(0, 5);
    if (isTimeAvailable(date, time, barberId)) times.push(time);
    cursor.setMinutes(cursor.getMinutes() + state.business.interval);
  }

  return times;
}

function isTimeAvailable(date, time, barberId) {
  const service = serviceById(booking.serviceId) || state.services[0];
  const start = timeToMinutes(time);
  const end = start + service.duration;
  if (end > timeToMinutes(state.business.close)) return false;
  if (state.business.blocked.includes(`${date}|${time}|${barberId}`)) return false;

  return !state.appointments.some((item) => {
    if (item.date !== date || isCanceledStatus(item.status) || item.barberId !== barberId) return false;
    const itemService = serviceById(item.serviceId) || state.services[0];
    const itemStart = timeToMinutes(item.time);
    const itemEnd = itemStart + itemService.duration;
    return start < itemEnd && end > itemStart;
  });
}

function resolveAnyBarber() {
  if (booking.barberId !== "any") return booking.barberId;
  return state.barbers.find((item) => item.id !== "any" && isTimeAvailable(booking.date, booking.time, item.id))?.id || "";
}

function render() {
  document.querySelector("#app").innerHTML = isAdminRoute ? adminApp() : clientApp();
  bindEvents();
}

function logo() {
  return `<img class="logo-mark" src="${ASSET_BASE}rl-logo.svg" alt="RL Barbearia" />`;
}

function hasKnownClient() {
  return state.clients.length > 0 || Boolean(state.client);
}

function clientNeedsLegalAcceptance(client) {
  return client.termsVersion !== TERMS_VERSION || client.privacyVersion !== PRIVACY_VERSION;
}

function clientApp() {
  return `
    <main class="client-shell">
      <section class="phone-frame">
        ${!state.client && authStep === "welcome" ? "" : clientHeader()}
        <div class="screen">${clientContent()}</div>
        ${state.client ? clientNav() : ""}
      </section>
      ${legalDoc ? legalModal() : ""}
    </main>
  `;
}

function clientHeader() {
  const canBack = (!state.client && authStep !== "welcome") || (state.client && clientScreen === "book" && bookingStep !== "service");
  const greeting = state.client ? `Olá, ${state.client.name.split(" ")[0]}` : "RL Barbearia";
  return `
    <header class="app-header">
      <button class="icon-button ${canBack ? "" : "hidden"}" data-back aria-label="Voltar">‹</button>
      <div class="brand-center">
        ${logo()}
        <div>
          <strong>${greeting}</strong>
          <span>${stepLabel()}</span>
        </div>
      </div>
      <span class="step-dot">${stepNumber()}</span>
    </header>
  `;
}

function stepLabel() {
  if (!state.client) return "Seu próximo corte começa aqui";
  if (clientScreen === "appointments") return "Meus horários";
  if (clientScreen === "profile") return "Perfil";
  const labels = {
    service: "Escolha o serviço",
    barber: "Escolha o profissional",
    date: "Escolha a data",
    time: "Escolha o horário",
    review: "Revise e confirme",
    success: "Agendamento confirmado",
  };
  return labels[bookingStep] || "Início";
}

function stepNumber() {
  const steps = ["service", "barber", "date", "time", "review"];
  const index = steps.indexOf(bookingStep);
  return index >= 0 ? `${index + 1}/5` : "";
}

function clientContent() {
  if (!state.client && authStep === "welcome") return welcomeScreen();
  if (!state.client && authStep === "register") return registerScreen(phoneDraft);
  if (!state.client) return phoneScreen();
  if (clientScreen === "appointments") return appointmentsScreen();
  if (clientScreen === "profile") return profileScreen();
  if (clientScreen === "home") return homeScreen();
  if (bookingStep === "barber") return barberScreen();
  if (bookingStep === "date") return dateScreen();
  if (bookingStep === "time") return timeScreen();
  if (bookingStep === "review") return reviewScreen();
  if (bookingStep === "success") return successScreen();
  return serviceScreen();
}

function phoneScreen() {
  return `
    <div class="login-screen">
      ${logo()}
      <h1>Seu próximo corte começa aqui</h1>
      <form class="form" id="phoneForm">
        <div class="field">
          <label for="phone">WhatsApp</label>
          <input id="phone" name="phone" inputmode="tel" placeholder="(17) 99778-2830" required />
        </div>
        <button class="primary full" type="submit">Continuar</button>
      </form>
      <div class="public-links">
        <button data-whatsapp>Contato</button>
        <span>${state.business.address}</span>
      </div>
    </div>
  `;
}

function registerScreen(phone) {
  return `
    <div class="stack">
      <h1>Complete seu cadastro</h1>
      <p class="lead">Precisamos disso apenas no primeiro acesso.</p>
      <form class="form" id="registerForm">
        <input type="hidden" name="phone" value="${phone}" />
        <div class="field">
          <label for="name">Nome</label>
          <input id="name" name="name" placeholder="Seu nome" required />
        </div>
        <div class="field">
          <label for="birth">Data de nascimento</label>
          <input id="birth" name="birth" type="date" required />
        </div>
        <button class="primary full" type="submit">Entrar</button>
      </form>
    </div>
  `;
}

function legalModal() {
  const isTerms = legalDoc === "terms";
  return `
    <div class="legal-backdrop">
      <section class="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legalTitle">
        <div class="legal-modal-header">
          <h2 id="legalTitle">${isTerms ? "Termos de Uso" : "Política de Privacidade"}</h2>
          <button class="icon-button" data-close-legal aria-label="Fechar">×</button>
        </div>
        <div class="legal-scroll">
          <p class="legal-updated">Última atualização: ${isTerms ? TERMS_VERSION : PRIVACY_VERSION}</p>
          ${isTerms ? termsContent() : privacyContent()}
        </div>
        <button class="primary full" data-close-legal>Li e entendi</button>
      </section>
    </div>
  `;
}

function showLegalModal(type) {
  legalDoc = type;
  document.querySelector(".legal-backdrop")?.remove();
  document.querySelector(".client-shell")?.insertAdjacentHTML("beforeend", legalModal());
  bindLegalClose();
}

function bindLegalClose() {
  document.querySelectorAll("[data-close-legal]").forEach((button) => {
    button.addEventListener("click", () => {
      legalDoc = null;
      document.querySelector(".legal-backdrop")?.remove();
    });
  });
}

function bindRegisterLegalControls() {
  const form = document.querySelector("#registerForm");
  if (!form) return;
  const accepted = form.querySelector("[name='legalAccepted']");
  const submit = form.querySelector("#createAccountButton");
  const error = form.querySelector("#legalError");

  const sync = () => {
    submit.disabled = !accepted.checked;
    if (accepted.checked) error?.setAttribute("hidden", "");
  };

  sync();
  accepted.addEventListener("change", sync);

  form.querySelectorAll("[data-legal-doc]").forEach((button) => {
    button.addEventListener("click", () => showLegalModal(button.dataset.legalDoc));
  });
}

function termsContent() {
  return `
    <h3>Finalidade</h3>
    <p>Este sistema permite que clientes da RL Barbearia cadastrem seus dados básicos, consultem horários disponíveis e solicitem agendamentos.</p>
    <h3>Dados informados</h3>
    <p>O cliente é responsável por manter nome, WhatsApp e data de nascimento corretos para facilitar contato e identificação do agendamento.</p>
    <h3>Agendamentos</h3>
    <p>O horário escolhido fica vinculado ao serviço, profissional, data e hora selecionados. A disponibilidade é conferida antes da confirmação.</p>
    <h3>Cancelamento e reagendamento</h3>
    <p>Cancelamentos e reagendamentos devem ser feitos pelos canais disponíveis no aplicativo ou pelo WhatsApp da RL Barbearia.</p>
    <h3>Atrasos e não comparecimento</h3>
    <p>Atrasos podem impactar o atendimento. Em caso de não comparecimento, um novo horário poderá depender da disponibilidade da barbearia.</p>
    <h3>Pagamento</h3>
    <p>O pagamento é realizado presencialmente na barbearia, conforme o serviço contratado.</p>
    <h3>Alterações pela barbearia</h3>
    <p>A RL Barbearia pode ajustar horários por necessidade operacional, folgas, bloqueios ou imprevistos, comunicando o cliente quando necessário.</p>
    <h3>Contato</h3>
    <p>Dúvidas sobre agendamentos podem ser tratadas pelo WhatsApp da RL Barbearia: (17) 99778-2830 ou (11) 99021-2577.</p>
  `;
}

function privacyContent() {
  return `
    <h3>Dados coletados</h3>
    <p>São coletados nome, WhatsApp, data de nascimento e informações dos agendamentos, como serviço, profissional, data, horário, valor e status.</p>
    <h3>Motivo da coleta</h3>
    <p>Esses dados são usados para identificar o cliente, organizar a agenda, confirmar horários e manter histórico básico de atendimentos.</p>
    <h3>Uso dos dados</h3>
    <p>As informações são utilizadas para funcionamento do agendamento e comunicações necessárias relacionadas aos horários marcados.</p>
    <h3>Armazenamento e proteção</h3>
    <p>Os dados devem ser armazenados em ambiente controlado pelo sistema. Informações administrativas como CNPJ, razão social, responsáveis e canais oficiais devem ser preenchidas pelo responsável antes da publicação.</p>
    <h3>Comunicações</h3>
    <p>A RL Barbearia pode enviar mensagens necessárias sobre confirmação, alteração, cancelamento ou lembrete de agendamento. Mensagens promocionais dependem de consentimento separado e opcional.</p>
    <h3>Direitos do titular</h3>
    <p>O cliente pode solicitar correção ou exclusão dos dados cadastrados, observadas as necessidades de histórico operacional da agenda.</p>
    <h3>Solicitações e contato</h3>
    <p>Pedidos de correção, exclusão ou dúvidas sobre privacidade podem ser feitos pelo WhatsApp da RL Barbearia: (17) 99778-2830 ou (11) 99021-2577.</p>
  `;
}

function homeScreen() {
  const next = state.appointments
    .filter((item) => item.phone === state.client.phone && !isCanceledStatus(item.status))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];

  return `
    <div class="stack">
      <section class="hero-card">
        <span>RL Barbearia</span>
        <h1>Abriu, escolheu, confirmou.</h1>
        <button class="primary full" data-start-booking>Agendar horário</button>
      </section>
      <section class="shop-photo-card" aria-label="Equipe RL Barbearia"></section>
      <section class="card">
        <strong>Próximo horário</strong>
        ${
          next
            ? `<p>${serviceById(next.serviceId)?.name} com ${barberById(next.barberId)?.name}<br /><span>${fullDate(next.date)} às ${next.time}</span></p>`
            : `<p><span>Nenhum horário marcado.</span></p>`
        }
      </section>
      <section class="card">
        <strong>Contato e localização</strong>
        <p><span>${state.business.address}<br />(17) 99778-2830 · (11) 99021-2577<br />${state.business.instagram}</span></p>
      </section>
    </div>
  `;
}

function serviceScreen() {
  return `
    <div class="stack">
      <h1>Escolha o serviço</h1>
      <div class="option-list">
        ${state.services
          .map(
            (item) => `
              <article class="horizontal-card">
                <div>
                  <strong>${item.name}</strong>
                  <span>${item.duration} minutos · ${money(item.price)}</span>
                </div>
                <button class="small-primary" data-pick-service="${item.id}">Selecionar</button>
              </article>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function barberScreen() {
  return `
    <div class="stack">
      <h1>Escolha o profissional</h1>
      <div class="option-list">
        ${state.barbers
          .map(
            (item) => `
              <button class="barber-card" data-pick-barber="${item.id}">
                ${
                  item.photo
                    ? `<img class="avatar-photo" src="${item.photo}" alt="${item.name}" style="object-position: ${item.position || "center"}" />`
                    : `<span class="avatar">RL</span>`
                }
                <span><strong>${item.name}</strong><small>${item.role}</small></span>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function dateScreen() {
  return `
    <div class="stack">
      <h1>Escolha a data</h1>
      <div class="date-strip">
        ${Array.from({ length: 10 }, (_, offset) => {
          const value = todayISO(offset);
          return `
            <button class="${booking.date === value ? "active" : ""}" data-pick-date="${value}">
              <strong>${shortDate(value).split(",")[0]}</strong>
              <span>${shortDate(value).split(",")[1] || fullDate(value)}</span>
            </button>
          `;
        }).join("")}
      </div>
      <button class="primary full" data-next-step="time">Continuar</button>
    </div>
  `;
}

function timeScreen() {
  const times = availableTimes(booking.date, booking.barberId);
  return `
    <div class="stack">
      <h1>Escolha o horário</h1>
      <div class="time-grid">
        ${
          times.length
            ? times.map((time) => `<button class="${booking.time === time ? "active" : ""}" data-pick-time="${time}">${time}</button>`).join("")
            : `<div class="empty">Nenhum horário livre para essa data.</div>`
        }
      </div>
      <button class="primary full" data-next-step="review" ${booking.time ? "" : "disabled"}>Continuar</button>
    </div>
  `;
}

function reviewScreen() {
  const service = serviceById(booking.serviceId);
  const barber = barberById(booking.barberId);
  return `
    <div class="stack">
      <h1>Revise seu horário</h1>
      <section class="review-card">
        <div><span>Serviço</span><strong>${service.name}</strong></div>
        <div><span>Profissional</span><strong>${barber.name}</strong></div>
        <div><span>Data</span><strong>${fullDate(booking.date)}</strong></div>
        <div><span>Horário</span><strong>${booking.time}</strong></div>
        <div><span>Valor</span><strong>${money(service.price)}</strong></div>
        <div><span>Pagamento</span><strong>Presencial</strong></div>
      </section>
      <button class="primary full" data-confirm-booking>Confirmar agendamento</button>
    </div>
  `;
}

function successScreen() {
  return `
    <div class="success-screen">
      <div class="check">✓</div>
      <h1>Agendamento confirmado!</h1>
      <p>${serviceById(booking.serviceId)?.name}<br />Dia ${fullDate(booking.date)} às ${booking.time}<br />RL Barbearia</p>
      <button class="primary full" data-calendar>Adicionar ao calendário</button>
      <button class="secondary full" data-whatsapp>Falar no WhatsApp</button>
    </div>
  `;
}

function appointmentsScreen() {
  const items = state.appointments
    .filter((item) => item.phone === state.client.phone)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  return `
    <div class="stack">
      <h1>Meus horários</h1>
      ${items.length ? items.map(appointmentCard).join("") : `<div class="empty">Você ainda não tem agendamentos.</div>`}
    </div>
  `;
}

function appointmentCard(item) {
  const rescheduleLabel = isCompletedStatus(item.status) || isNoShowStatus(item.status) ? "Agendar novamente" : "Reagendar";
  return `
    <article class="card">
      <div class="row">
        <div>
          <strong>${serviceById(item.serviceId)?.name}</strong>
          <p><span>${fullDate(item.date)} às ${item.time} · ${barberById(item.barberId)?.name}</span></p>
        </div>
        <span class="status ${item.status}">${item.status}</span>
      </div>
      <div class="actions">
        <button class="ghost ${canCancelAppointment(item) ? "" : "wide-action"}" data-reschedule="${item.id}">${rescheduleLabel}</button>
        ${canCancelAppointment(item) ? `<button class="danger" data-cancel="${item.id}">Cancelar</button>` : ""}
      </div>
    </article>
  `;
}

function profileScreen() {
  return `
    <div class="stack">
      <h1>Perfil</h1>
      <form class="form" id="profileForm">
        <div class="field"><label>Nome</label><input name="name" value="${state.client.name}" required /></div>
        <div class="field"><label>WhatsApp</label><input name="phone" value="${state.client.phone}" required /></div>
        <div class="field"><label>Nascimento</label><input name="birth" type="date" value="${state.client.birth || ""}" /></div>
        <button class="primary full" type="submit">Salvar</button>
        <button class="ghost full" type="button" data-logout>Sair</button>
      </form>
    </div>
  `;
}

function clientNav() {
  return `
    <nav class="bottom-nav">
      <button data-client-nav="home" class="${clientScreen === "home" ? "active" : ""}">Início</button>
      <button data-client-nav="book" class="${clientScreen === "book" ? "active" : ""}">Agendar</button>
      <button data-client-nav="appointments" class="${clientScreen === "appointments" ? "active" : ""}">Meus horários</button>
      <button data-client-nav="profile" class="${clientScreen === "profile" ? "active" : ""}">Perfil</button>
    </nav>
  `;
}

function adminApp() {
  if (sessionStorage.getItem("rl-admin-auth") !== "true") return adminLogin();
  return `
    <main class="admin-shell">
      <aside class="admin-sidebar">
        ${logo()}
        <strong>RL Admin</strong>
        ${["overview", "agenda", "clients", "services", "barbers", "hours", "settings"]
          .map((page) => `<button class="${adminPage === page ? "active" : ""}" data-admin-page="${page}">${adminPageLabel(page)}</button>`)
          .join("")}
      </aside>
      <section class="admin-main">
        ${adminPageContent()}
      </section>
      ${modal ? modalView() : ""}
    </main>
  `;
}

function adminLogin() {
  return `
    <main class="client-shell">
      <section class="phone-frame narrow">
        <div class="screen center-screen">
          ${logo()}
          <h1>Acesso administrativo</h1>
          <form class="form" id="adminLoginForm">
            <div class="field">
              <label>Senha</label>
              <input name="password" type="password" required />
            </div>
            <button class="primary full" type="submit">Entrar</button>
          </form>
        </div>
      </section>
    </main>
  `;
}

function adminPageLabel(page) {
  return {
    overview: "Visão geral",
    agenda: "Agenda",
    clients: "Clientes",
    services: "Serviços",
    barbers: "Profissionais",
    hours: "Horários e bloqueios",
    settings: "Configurações",
  }[page];
}

function adminPageContent() {
  if (adminPage === "agenda") return adminAgenda(true);
  if (adminPage === "clients") return adminList("Clientes", state.clients, "client");
  if (adminPage === "services") return adminList("Serviços", state.services, "service");
  if (adminPage === "barbers") return adminList("Profissionais", state.barbers, "barber");
  if (adminPage === "hours") return adminHours();
  if (adminPage === "settings") return adminSettings();
  return adminOverview();
}

function adminOverview() {
  const today = state.appointments.filter((item) => item.date === todayISO() && !isCanceledStatus(item.status));
  const next = [...today].sort((a, b) => a.time.localeCompare(b.time))[0];
  return `
    <div class="admin-stack">
      <div class="admin-title">
        <div><h1>Visão geral</h1><p>Agenda de hoje e ações rápidas.</p></div>
        <button class="primary" data-open-modal="appointment">Novo agendamento</button>
      </div>
      <div class="stats">
        <div class="stat"><strong>${today.length}</strong><span>Atendimentos de hoje</span></div>
        <div class="stat"><strong>${next ? next.time : "--"}</strong><span>Próximo cliente</span></div>
      </div>
      ${adminAgenda(false)}
    </div>
  `;
}

function adminAgenda(showTitle) {
  const items = state.appointments
    .filter((item) => (showTitle ? true : item.date === todayISO()))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return `
    <section class="admin-panel">
      ${showTitle ? `<div class="admin-title"><div><h1>Agenda</h1><p>Atendimentos diários e semanais.</p></div><button class="primary" data-open-modal="appointment">Novo agendamento</button></div>` : `<h2>Agenda de hoje</h2>`}
      <div class="admin-list">
        ${items.length ? items.map(adminAppointment).join("") : `<div class="empty">Nenhum agendamento.</div>`}
      </div>
    </section>
  `;
}

function adminAppointment(item) {
  return `
    <article class="admin-row">
      <strong>${item.time}</strong>
      <div>
        <b>${item.clientName}</b>
        <span>${fullDate(item.date)} · ${serviceById(item.serviceId)?.name} · ${barberById(item.barberId)?.name}</span>
      </div>
      <div class="actions">
        <span class="status ${item.status}">${item.status}</span>
        <button class="ghost" data-status="${item.id}|confirmado">Confirmar</button>
        <button class="secondary" data-status="${item.id}|concluido">Concluir</button>
        <button class="danger" data-status="${item.id}|cancelado">Cancelar</button>
      </div>
    </article>
  `;
}

function adminList(title, items, kind) {
  return `
    <div class="admin-stack">
      <div class="admin-title">
        <div><h1>${title}</h1><p>Cadastros separados da agenda.</p></div>
        <button class="primary" data-open-modal="${kind}">Novo cadastro</button>
      </div>
      <section class="admin-panel">
        <div class="admin-list">
          ${items
            .map((item) => `<article class="admin-row"><strong>${item.name}</strong><div><span>${item.phone || item.role || `${item.duration} min · ${money(item.price)}`}</span></div></article>`)
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function adminHours() {
  return `
    <div class="admin-stack">
      <div class="admin-title">
        <div><h1>Horários e bloqueios</h1><p>Atendimento das ${state.business.open} às ${state.business.close}.</p></div>
        <button class="primary" data-open-modal="block">Bloquear horário</button>
      </div>
      <section class="admin-panel">
        <form class="inline-form" id="hoursForm">
          <input name="open" type="time" value="${state.business.open}" />
          <input name="close" type="time" value="${state.business.close}" />
          <button class="primary" type="submit">Salvar horários</button>
        </form>
      </section>
    </div>
  `;
}

function adminSettings() {
  return `
    <div class="admin-stack">
      <div class="admin-title"><div><h1>Configurações</h1><p>Dados públicos da barbearia.</p></div></div>
      <section class="admin-panel">
        <p>${state.business.address}</p>
        <p>(17) 99778-2830 · (11) 99021-2577</p>
        <p>${state.business.instagram}</p>
      </section>
    </div>
  `;
}

function modalView() {
  const titles = {
    appointment: "Novo agendamento",
    client: "Novo cliente",
    service: "Novo serviço",
    barber: "Novo profissional",
    block: "Bloquear horário",
  };
  return `
    <div class="modal-backdrop">
      <section class="modal">
        <div class="row"><h2>${titles[modal]}</h2><button class="icon-button" data-close-modal>×</button></div>
        ${modalForm()}
      </section>
    </div>
  `;
}

function modalForm() {
  if (modal === "service") return `<form class="form" id="serviceForm"><input name="name" placeholder="Serviço" required /><input name="price" type="number" placeholder="Preço" required /><input name="duration" type="number" placeholder="Minutos" required /><button class="primary full">Salvar</button></form>`;
  if (modal === "barber") return `<form class="form" id="barberForm"><input name="name" placeholder="Nome" required /><input name="role" placeholder="Função" required /><button class="primary full">Salvar</button></form>`;
  if (modal === "client") return `<form class="form" id="clientForm"><input name="name" placeholder="Nome" required /><input name="phone" placeholder="WhatsApp" required /><input name="birth" type="date" /><button class="primary full">Salvar</button></form>`;
  if (modal === "block") return `<form class="form" id="blockForm"><input name="date" type="date" value="${todayISO()}" required /><input name="time" type="time" required /><select name="barberId">${state.barbers.map((b) => `<option value="${b.id}">${b.name}</option>`).join("")}</select><button class="primary full">Bloquear</button></form>`;
  return `<form class="form" id="manualAppointmentForm"><input name="clientName" placeholder="Cliente" required /><input name="phone" placeholder="WhatsApp" required /><select name="serviceId">${state.services.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select><select name="barberId">${state.barbers.map((b) => `<option value="${b.id}">${b.name}</option>`).join("")}</select><input name="date" type="date" value="${todayISO()}" required /><input name="time" type="time" required /><button class="primary full">Salvar</button></form>`;
}

function bindEvents() {
  document.querySelector("#phoneForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    phoneDraft = cleanPhone(new FormData(event.target).get("phone"));
    const existing = clientByPhone(phoneDraft);
    if (!existing) {
      document.querySelector(".screen").innerHTML = registerScreen(phoneDraft);
      bindEvents();
      return;
    }
    state.client = existing;
    clientScreen = "home";
    saveState();
    render();
  });

  document.querySelector("#registerForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    if (cleanPhone(data.phone).length < 10 || cleanPhone(data.phone).length > 11) {
      event.target.querySelector("[name='phone']").setCustomValidity("Informe um WhatsApp válido.");
      event.target.reportValidity();
      event.target.querySelector("[name='phone']").setCustomValidity("");
      return;
    }
    state.client = { name: data.name, phone: cleanPhone(data.phone), birth: data.birth };
    upsertClient(state.client);
    clientScreen = "home";
    saveState();
    render();
  });

  document.querySelectorAll("[data-client-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      clientScreen = button.dataset.clientNav;
      if (clientScreen === "book") {
        booking = initialBooking();
        bookingStep = "service";
      }
      render();
    });
  });

  document.querySelector("[data-start-booking]")?.addEventListener("click", () => {
    clientScreen = "book";
    booking = initialBooking();
    bookingStep = "service";
    render();
  });

  document.querySelectorAll("[data-pick-service]").forEach((button) => {
    button.addEventListener("click", () => {
      booking.serviceId = button.dataset.pickService;
      bookingStep = "barber";
      render();
    });
  });

  document.querySelectorAll("[data-pick-barber]").forEach((button) => {
    button.addEventListener("click", () => {
      booking.barberId = button.dataset.pickBarber;
      bookingStep = "date";
      render();
    });
  });

  document.querySelectorAll("[data-pick-date]").forEach((button) => {
    button.addEventListener("click", () => {
      booking.date = button.dataset.pickDate;
      booking.time = "";
      render();
    });
  });

  document.querySelectorAll("[data-pick-time]").forEach((button) => {
    button.addEventListener("click", () => {
      booking.time = button.dataset.pickTime;
      render();
    });
  });

  document.querySelectorAll("[data-next-step]").forEach((button) => {
    button.addEventListener("click", () => {
      bookingStep = button.dataset.nextStep;
      render();
    });
  });

  document.querySelector("[data-back]")?.addEventListener("click", () => {
    const steps = ["service", "barber", "date", "time", "review"];
    bookingStep = steps[Math.max(0, steps.indexOf(bookingStep) - 1)];
    render();
  });

  document.querySelector("[data-confirm-booking]")?.addEventListener("click", () => {
    state.appointments.push({
      id: crypto.randomUUID(),
      clientName: state.client.name,
      phone: state.client.phone,
      serviceId: booking.serviceId,
      barberId: booking.barberId,
      date: booking.date,
      time: booking.time,
      status: "confirmado",
    });
    saveState();
    bookingStep = "success";
    render();
  });

  document.querySelector("[data-calendar]")?.addEventListener("click", () => {
    const service = serviceById(booking.serviceId)?.name || "RL Barbearia";
    const start = `${booking.date.replaceAll("-", "")}T${booking.time.replace(":", "")}00`;
    location.href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(service)}&dates=${start}/${start}&location=${encodeURIComponent(state.business.address)}`;
  });

  document.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.appointments.find((a) => a.id === button.dataset.cancel);
      if (item) item.status = "cancelado";
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-reschedule]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.appointments.find((a) => a.id === button.dataset.reschedule);
      if (item) item.status = "cancelado";
      clientScreen = "book";
      booking = initialBooking();
      bookingStep = "service";
      saveState();
      render();
    });
  });

  document.querySelector("#profileForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const phone = cleanPhone(data.phone);
    const previous = clientByPhone(phone) || state.client || {};
    state.client = { ...previous, name: data.name, phone, birth: data.birth };
    upsertClient(state.client);
    saveState();
    render();
  });

  document.querySelector("[data-logout]")?.addEventListener("click", () => {
    state.client = null;
    saveState();
    render();
  });

  document.querySelectorAll("[data-whatsapp]").forEach((button) => {
    button.addEventListener("click", () => window.open(`https://wa.me/${state.business.whatsapp}`, "_blank", "noopener,noreferrer"));
  });

  bindAdminEvents();
}

function bindAdminEvents() {
  document.querySelector("#adminLoginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (new FormData(event.target).get("password") === ADMIN_PASSWORD) {
      sessionStorage.setItem("rl-admin-auth", "true");
      render();
    } else {
      alert("Senha inválida.");
    }
  });

  document.querySelectorAll("[data-admin-page]").forEach((button) => {
    button.addEventListener("click", () => {
      adminPage = button.dataset.adminPage;
      render();
    });
  });

  document.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      modal = button.dataset.openModal;
      render();
    });
  });

  document.querySelector("[data-close-modal]")?.addEventListener("click", () => {
    modal = null;
    render();
  });

  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, status] = button.dataset.status.split("|");
      const item = state.appointments.find((a) => a.id === id);
      if (item) item.status = status;
      saveState();
      render();
    });
  });

  document.querySelector("#serviceForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.services.push({ id: crypto.randomUUID(), name: data.name, price: Number(data.price), duration: Number(data.duration) });
    modal = null;
    saveState();
    render();
  });

  document.querySelector("#barberForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.barbers.push({ id: crypto.randomUUID(), name: data.name, role: data.role, photo: data.name[0].toUpperCase() });
    modal = null;
    saveState();
    render();
  });

  document.querySelector("#clientForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    upsertClient(Object.fromEntries(new FormData(event.target)));
    modal = null;
    saveState();
    render();
  });

  document.querySelector("#blockForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.business.blocked.push(`${data.date}|${data.time}|${data.barberId}`);
    modal = null;
    saveState();
    render();
  });

  document.querySelector("#manualAppointmentForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.appointments.push({ id: crypto.randomUUID(), ...data, phone: cleanPhone(data.phone), status: "pendente" });
    upsertClient({ name: data.clientName, phone: data.phone });
    modal = null;
    saveState();
    render();
  });

  document.querySelector("#hoursForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.business.open = data.open;
    state.business.close = data.close;
    saveState();
    render();
  });
}

function welcomeScreen() {
  const returningClient = hasKnownClient();
  return `
    <div class="welcome-screen">
      <img class="welcome-watermark" src="${ASSET_BASE}rl-monogram.svg" alt="" aria-hidden="true" />
      <div class="welcome-content">
        ${logo()}
        <strong>RL Barbearia</strong>
        <h1>Seu próximo corte começa aqui</h1>
        <div class="welcome-actions">
          ${
            returningClient
              ? `<button class="primary full" data-auth-step="login">Entrar</button>`
              : `<button class="primary full" data-auth-step="register">Primeiro acesso</button>`
          }
        </div>
      </div>
    </div>
  `;
}

function phoneScreen() {
  return `
    <div class="stack auth-panel">
      <h1>Entre para agendar</h1>
      <p class="lead">Informe seu WhatsApp para acessar seus horários ou fazer um novo agendamento.</p>
      <form class="form" id="phoneForm">
        <div class="field">
          <label for="phone">WhatsApp</label>
          <div class="phone-field"><span>+55</span><input id="phone" name="phone" inputmode="tel" placeholder="(17) 99778-2830" required /></div>
        </div>
        <button class="primary full" type="submit">Continuar</button>
      </form>
    </div>
  `;
}

function registerScreen(phone) {
  const hasPhone = cleanPhone(phone).length > 0;
  const existingClient = clientByPhone(phone) || {};
  return `
    <div class="stack auth-panel">
      <h1>Primeiro acesso</h1>
      <p class="lead">Complete seu cadastro para agendar mais rápido.</p>
      <form class="form" id="registerForm">
        <div class="field"><label>WhatsApp</label><div class="phone-field ${hasPhone ? "readonly" : ""}"><span>+55</span><input name="phone" value="${phone}" inputmode="tel" placeholder="(17) 99778-2830" ${hasPhone ? "readonly" : ""} required /></div></div>
        <div class="field"><label>Nome completo</label><input name="name" value="${existingClient.name || ""}" placeholder="Seu nome" required /></div>
        <div class="field"><label>Data de nascimento</label><input name="birth" type="date" value="${existingClient.birth || ""}" required /></div>
        <div class="legal-group">
          <label class="check-field legal-consent">
            <input name="legalAccepted" type="checkbox" required />
            <span class="custom-check" aria-hidden="true"></span>
            <span>Li e concordo com os <button type="button" class="inline-link" data-legal-doc="terms">Termos de Uso</button> e com a <button type="button" class="inline-link" data-legal-doc="privacy">Política de Privacidade</button>.</span>
          </label>
          <label class="check-field legal-consent optional">
            <input name="marketingConsent" type="checkbox" />
            <span class="custom-check" aria-hidden="true"></span>
            <span>Quero receber novidades e promoções da RL pelo WhatsApp.</span>
          </label>
          <p class="form-error" id="legalError" hidden>Para criar seu cadastro, leia e aceite os Termos de Uso e a Política de Privacidade.</p>
        </div>
        <button class="primary full" id="createAccountButton" type="submit" disabled>Criar meu cadastro</button>
      </form>
    </div>
  `;
}

function serviceIcon(name) {
  if (name.toLowerCase().includes("barba")) return "✦";
  if (name.toLowerCase().includes("combo")) return "+";
  return "RL";
}

function serviceScreen() {
  return `
    <div class="step-screen">
      <div class="progress"><span style="width:20%"></span></div>
      <div class="stack">
        <h1>Escolha o serviço</h1>
        <div class="option-list">
          ${state.services
            .map(
              (item) => `
                <button class="horizontal-card selectable ${booking.serviceId === item.id ? "active" : ""}" data-pick-service="${item.id}">
                  <span class="service-icon">${serviceIcon(item.name)}</span>
                  <span><strong>${item.name}</strong><small>${item.duration} minutos · ${money(item.price)}</small></span>
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="sticky-action"><button class="primary full" data-next-step="barber" ${booking.serviceId ? "" : "disabled"}>Continuar</button></div>
    </div>
  `;
}

function barberScreen() {
  return `
    <div class="step-screen">
      <div class="progress"><span style="width:40%"></span></div>
      <div class="stack">
        <h1>Escolha o profissional</h1>
        <div class="option-list">
          ${state.barbers
            .map(
              (item) => `
                <button class="barber-card selectable ${booking.barberId === item.id ? "active" : ""}" data-pick-barber="${item.id}">
                  ${item.photo && item.photo.startsWith("/") ? `<img class="avatar-photo" src="${item.photo}" alt="${item.name}" style="object-position: ${item.position || "center"}" />` : `<span class="avatar">${item.photo || "RL"}</span>`}
                  <span><strong>${item.name}</strong><small>${item.role}</small></span>
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="sticky-action"><button class="primary full" data-next-step="date" ${booking.barberId ? "" : "disabled"}>Continuar</button></div>
    </div>
  `;
}

function dateScreen() {
  return `
    <div class="step-screen">
      <div class="progress"><span style="width:60%"></span></div>
      <div class="stack">
        <h1>Escolha a data</h1>
        <div class="date-strip">
          ${Array.from({ length: 14 }, (_, offset) => {
            const value = todayISO(offset);
            const parts = shortDate(value).split(",");
            return `<button class="${booking.date === value ? "active" : ""}" data-pick-date="${value}"><strong>${parts[0]}</strong><span>${parts[1] || fullDate(value)}</span></button>`;
          }).join("")}
        </div>
      </div>
      <div class="sticky-action"><button class="primary full" data-next-step="time">Continuar</button></div>
    </div>
  `;
}

function timeGroups(times) {
  const morning = times.filter((time) => time < "12:00");
  const afternoon = times.filter((time) => time >= "12:00");
  return { morning, afternoon };
}

function timeScreen() {
  const times = availableTimes(booking.date, booking.barberId);
  const groups = timeGroups(times);
  return `
    <div class="step-screen">
      <div class="progress"><span style="width:80%"></span></div>
      <div class="stack">
        <h1>Escolha o horário</h1>
        ${times.length ? timeGroupView("Manhã", groups.morning) + timeGroupView("Tarde", groups.afternoon) : `<div class="empty">Nenhum horário livre para essa data.</div>`}
      </div>
      <div class="sticky-action"><button class="primary full" data-next-step="review" ${booking.time ? "" : "disabled"}>Continuar</button></div>
    </div>
  `;
}

function timeGroupView(title, times) {
  if (!times.length) return "";
  return `<section class="time-section"><h2>${title}</h2><div class="time-grid">${times.map((time) => `<button class="${booking.time === time ? "active" : ""}" data-pick-time="${time}">${time}</button>`).join("")}</div></section>`;
}

function reviewScreen() {
  const service = serviceById(booking.serviceId);
  const barber = barberById(booking.barberId);
  return `
    <div class="step-screen">
      <div class="progress"><span style="width:100%"></span></div>
      <div class="stack">
        <h1>Confirme seu horário</h1>
        <section class="review-card">
          <div><span>Serviço</span><strong>${service.name}</strong></div>
          <div><span>Profissional</span><strong>${barber.name}</strong></div>
          <div><span>Data</span><strong>${fullDate(booking.date)}</strong></div>
          <div><span>Horário</span><strong>${booking.time}</strong></div>
          <div><span>Duração</span><strong>${service.duration} min</strong></div>
          <div><span>Valor</span><strong>${money(service.price)}</strong></div>
          <div><span>Pagamento</span><strong>Pagamento presencial</strong></div>
        </section>
        <button class="link-button" data-back>Voltar e alterar</button>
      </div>
      <div class="sticky-action"><button class="primary full" data-confirm-booking>Confirmar agendamento</button></div>
    </div>
  `;
}

function successScreen() {
  return `
    <div class="success-screen">
      <div class="check">✓</div>
      <h1>Horário confirmado!</h1>
      <p>${serviceById(booking.serviceId)?.name}<br />${fullDate(booking.date)} às ${booking.time}<br />RL Barbearia</p>
      <button class="primary full" data-calendar>Adicionar ao calendário</button>
      <button class="ghost full" data-client-nav="appointments">Ver meus agendamentos</button>
      <button class="secondary full" data-whatsapp>Falar com a RL no WhatsApp</button>
    </div>
  `;
}

function appointmentsScreen() {
  const items = state.appointments.filter((item) => item.phone === state.client.phone).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const upcoming = items.filter((item) => !isInactiveAppointment(item));
  const history = items.filter((item) => isInactiveAppointment(item));
  return `
    <div class="stack">
      <h1>Meus horários</h1>
      <div class="tabs-soft"><span>Próximos</span><span>Histórico</span></div>
      <h2>Próximos</h2>
      ${upcoming.length ? upcoming.map(appointmentCard).join("") : `<div class="empty">Você ainda não possui um horário agendado.<br /><button class="primary" data-start-booking>Agendar agora</button></div>`}
      <h2>Histórico</h2>
      ${history.length ? history.map(appointmentCard).join("") : `<div class="empty">Nenhum histórico ainda.</div>`}
    </div>
  `;
}

function clientNav() {
  return `
    <nav class="bottom-nav">
      <button data-client-nav="home" class="${clientScreen === "home" ? "active" : ""}"><span>⌂</span>Início</button>
      <button data-client-nav="book" class="${clientScreen === "book" ? "active" : ""}"><span>□</span>Agendar</button>
      <button data-client-nav="appointments" class="${clientScreen === "appointments" ? "active" : ""}"><span>◷</span>Meus horários</button>
      <button data-client-nav="profile" class="${clientScreen === "profile" ? "active" : ""}"><span>○</span>Perfil</button>
    </nav>
  `;
}

function bindEvents() {
  document.onkeydown = (event) => {
    if (event.key !== "Escape") return;
    if (legalDoc) {
      legalDoc = null;
      document.querySelector(".legal-backdrop")?.remove();
      return;
    }
    if (modal) {
      modal = null;
      render();
    }
  };

  document.querySelectorAll("[data-auth-step]").forEach((button) => {
    button.addEventListener("click", () => {
      authStep = button.dataset.authStep;
      if (authStep === "register") phoneDraft = "";
      render();
    });
  });
  bindRegisterLegalControls();
  bindLegalClose();

  document.querySelector("#phoneForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    phoneDraft = cleanPhone(new FormData(event.target).get("phone"));
    if (phoneDraft.length < 10 || phoneDraft.length > 11) {
      event.target.querySelector("input").setCustomValidity("Informe um WhatsApp válido.");
      event.target.reportValidity();
      event.target.querySelector("input").setCustomValidity("");
      return;
    }
    const existing = clientByPhone(phoneDraft);
    if (!existing) {
      authStep = "register";
      render();
      return;
    }
    if (clientNeedsLegalAcceptance(existing)) {
      authStep = "register";
      render();
      return;
    }
    state.client = existing;
    clientScreen = "home";
    saveState();
    render();
  });

  document.querySelector("#registerForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    if (cleanPhone(data.phone).length < 10 || cleanPhone(data.phone).length > 11) {
      event.target.querySelector("[name='phone']").setCustomValidity("Informe um WhatsApp válido.");
      event.target.reportValidity();
      event.target.querySelector("[name='phone']").setCustomValidity("");
      return;
    }
    if (!data.legalAccepted) {
      document.querySelector("#legalError")?.removeAttribute("hidden");
      document.querySelector("[name='legalAccepted']")?.focus();
      return;
    }
    const phone = cleanPhone(data.phone);
    const existing = clientByPhone(phone);
    state.client = { ...(existing || {}), name: data.name, phone, birth: data.birth };
    const acceptedAt = new Date().toISOString();
    state.client.termsAcceptedAt = acceptedAt;
    state.client.termsVersion = TERMS_VERSION;
    state.client.privacyAcceptedAt = acceptedAt;
    state.client.privacyVersion = PRIVACY_VERSION;
    state.client.marketingConsent = Boolean(data.marketingConsent);
    upsertClient(state.client);
    clientScreen = "home";
    saveState();
    render();
  });

  document.querySelectorAll("[data-client-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      clientScreen = button.dataset.clientNav;
      if (clientScreen === "book") {
        booking = initialBooking();
        bookingStep = "service";
      }
      render();
    });
  });

  document.querySelector("[data-start-booking]")?.addEventListener("click", () => {
    clientScreen = "book";
    booking = initialBooking();
    bookingStep = "service";
    render();
  });

  document.querySelectorAll("[data-pick-service]").forEach((button) => button.addEventListener("click", () => {
    booking.serviceId = button.dataset.pickService;
    booking.time = "";
    render();
  }));

  document.querySelectorAll("[data-pick-barber]").forEach((button) => button.addEventListener("click", () => {
    booking.barberId = button.dataset.pickBarber;
    booking.time = "";
    render();
  }));

  document.querySelectorAll("[data-pick-date]").forEach((button) => button.addEventListener("click", () => {
    booking.date = button.dataset.pickDate;
    booking.time = "";
    render();
  }));

  document.querySelectorAll("[data-pick-time]").forEach((button) => button.addEventListener("click", () => {
    booking.time = button.dataset.pickTime;
    render();
  }));

  document.querySelectorAll("[data-next-step]").forEach((button) => button.addEventListener("click", () => {
    bookingStep = button.dataset.nextStep;
    render();
  }));

  document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => {
    if (!state.client) {
      authStep = "welcome";
      render();
      return;
    }
    const steps = ["service", "barber", "date", "time", "review"];
    bookingStep = steps[Math.max(0, steps.indexOf(bookingStep) - 1)];
    render();
  }));

  document.querySelector("[data-confirm-booking]")?.addEventListener("click", (event) => {
    event.currentTarget.disabled = true;
    const assignedBarber = resolveAnyBarber();
    if (!assignedBarber || !isTimeAvailable(booking.date, booking.time, assignedBarber)) {
      alert("Esse horário acabou de ficar indisponível. Escolha outro horário.");
      bookingStep = "time";
      render();
      return;
    }
    booking.barberId = assignedBarber;
    state.appointments.push({
      id: crypto.randomUUID(),
      clientName: state.client.name,
      phone: state.client.phone,
      serviceId: booking.serviceId,
      barberId: booking.barberId,
      date: booking.date,
      time: booking.time,
      price: serviceById(booking.serviceId)?.price,
      status: "confirmado",
      previousAppointmentId: booking.previousAppointmentId || null,
    });
    saveState();
    bookingStep = "success";
    render();
  });

  document.querySelector("[data-calendar]")?.addEventListener("click", () => {
    const service = serviceById(booking.serviceId)?.name || "RL Barbearia";
    const start = `${booking.date.replaceAll("-", "")}T${booking.time.replace(":", "")}00`;
    location.href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(service)}&dates=${start}/${start}&location=${encodeURIComponent(state.business.address)}`;
  });

  document.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => {
    if (!confirm("Cancelar este agendamento?")) return;
    const item = state.appointments.find((a) => a.id === button.dataset.cancel);
    if (!item || !canCancelAppointment(item)) {
      alert("Este agendamento não pode ser cancelado.");
      render();
      return;
    }
    item.status = "cancelado";
    saveState();
    render();
  }));

  document.querySelectorAll("[data-reschedule]").forEach((button) => button.addEventListener("click", () => {
    const item = state.appointments.find((a) => a.id === button.dataset.reschedule);
    if (!item) return;
    if (canCancelAppointment(item)) item.status = "cancelado";
    clientScreen = "book";
    booking = {
      ...initialBooking(),
      serviceId: item.serviceId,
      barberId: item.barberId,
      previousAppointmentId: item.id,
    };
    bookingStep = "barber";
    saveState();
    render();
  }));

  document.querySelector("#profileForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.client = { name: data.name, phone: cleanPhone(data.phone), birth: data.birth };
    upsertClient(state.client);
    saveState();
    render();
  });

  document.querySelector("[data-logout]")?.addEventListener("click", () => {
    state.client = null;
    authStep = "welcome";
    state.lastAccessAt = null;
    saveState(false);
    render();
  });

  document.querySelectorAll("[data-whatsapp]").forEach((button) => button.addEventListener("click", () => window.open(`https://wa.me/${state.business.whatsapp}`, "_blank", "noopener,noreferrer")));
  bindAdminEvents();
}

function adminOverview() {
  const today = state.appointments.filter((item) => item.date === todayISO() && !isCanceledStatus(item.status));
  const next = [...today].sort((a, b) => a.time.localeCompare(b.time))[0];
  const pending = state.appointments.filter((item) => item.status === "pendente").length;
  const free = state.barbers
    .filter((item) => item.id !== "any")
    .reduce((total, barber) => total + availableTimes(todayISO(), barber.id).length, 0);

  return `
    <div class="admin-stack">
      <div class="admin-title">
        <div><h1>Visão geral</h1><p>Agenda de hoje e ações rápidas.</p></div>
        <button class="primary" data-open-modal="appointment">Novo agendamento</button>
      </div>
      <div class="stats four">
        <div class="stat"><strong>${today.length}</strong><span>Atendimentos hoje</span></div>
        <div class="stat"><strong>${next ? next.time : "--"}</strong><span>Próximo cliente</span></div>
        <div class="stat"><strong>${pending}</strong><span>Pendentes</span></div>
        <div class="stat"><strong>${free}</strong><span>Horários livres</span></div>
      </div>
      ${adminAgenda(false)}
    </div>
  `;
}

render();
