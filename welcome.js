/* Hangari · bienvenida navideña con reproducción iniciada por interacción. */
(() => {
  "use strict";
  const overlay = document.getElementById("hangari-welcome");
  const closeButton = document.getElementById("hangari-welcome-close");
  const enterButton = document.getElementById("hangari-welcome-enter");
  const silentButton = document.getElementById("hangari-welcome-silent");
  const musicButton = document.getElementById("hangari-music-toggle");
  const musicLabel = document.getElementById("hangari-music-label");
  const musicIcon = document.getElementById("hangari-music-icon");
  const music = document.getElementById("hangari-welcome-audio");
  if (!overlay || !closeButton || !enterButton || !silentButton || !musicButton || !music) return;

  // Cada nueva visita: 65 % inicia exactamente en 00:00.
  // El 35 % restante elige otro segundo dentro de los primeros cinco minutos.
  // Si la canción dura menos, se limita el intervalo a su duración.
  const startAtBeginning = Math.random() < 0.65;
  const randomFraction = Math.random();
  let startSelected = false;
  let seekApplied = false;
  let dismissed = false;
  let playingRequested = false;
  let pausedByVisibility = false;

  music.volume = 0.5;
  music.loop = true;
  music.preload = "metadata";

  function useRandomStartingPoint() {
    if (!startSelected || seekApplied || music.readyState < 1) return;
    const duration = music.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const latestSecond = Math.max(0, Math.min(300, Math.floor(duration - 2)));
    const second = startAtBeginning || latestSecond < 1 ? 0 : 1 + Math.floor(randomFraction * latestSecond);
    try {
      music.currentTime = second;
      seekApplied = true;
    } catch (error) {
      console.info("Hangari: el navegador aplazó el salto musical.", error);
    }
  }

  music.addEventListener("loadedmetadata", useRandomStartingPoint);
  music.addEventListener("canplay", useRandomStartingPoint);

  function showMusicButton(mode) {
    musicButton.hidden = false;
    if (mode === "playing") {
      musicIcon.textContent = "♫";
      musicLabel.textContent = "Pausar música";
      musicButton.setAttribute("aria-label", "Pausar música navideña");
      musicButton.setAttribute("aria-pressed", "true");
      musicButton.classList.add("is-playing");
    } else if (mode === "ready") {
      musicIcon.textContent = "♪";
      musicLabel.textContent = "Activar música";
      musicButton.setAttribute("aria-label", "Activar música navideña");
      musicButton.setAttribute("aria-pressed", "false");
      musicButton.classList.remove("is-playing");
    } else {
      musicIcon.textContent = "♪";
      musicLabel.textContent = "Reanudar música";
      musicButton.setAttribute("aria-label", "Reanudar música navideña");
      musicButton.setAttribute("aria-pressed", "false");
      musicButton.classList.remove("is-playing");
    }
  }

  function playMusic() {
    music.volume = 0.5;
    // Mantener play() en el mismo evento de clic ayuda en Safari y Chrome móvil.
    useRandomStartingPoint();
    let result;
    try {
      result = music.play();
    } catch (error) {
      console.warn("Hangari: no se pudo iniciar el audio.", error);
      showMusicButton("ready");
      return;
    }
    playingRequested = true;
    showMusicButton("playing");
    if (document.hidden) {
      music.pause();
      pausedByVisibility = true;
      showMusicButton("paused");
    }
    if (result && typeof result.then === "function") {
      result.then(() => {
        useRandomStartingPoint();
        if (document.hidden) {
          music.pause();
          pausedByVisibility = true;
          showMusicButton("paused");
          return;
        }
        showMusicButton("playing");
      }).catch((error) => {
        playingRequested = false;
        showMusicButton("ready");
        console.info("Hangari: el navegador requiere otro toque para reproducir.", error);
      });
    }
  }

  function closeWelcome(withMusic) {
    if (dismissed) return;
    dismissed = true;
    if (withMusic) {
      startSelected = true;
      // Se invoca antes de esperar a que termine la animación.
      playMusic();
    }
    overlay.classList.add("is-closing");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("hangari-welcome-open");
    const removeOverlay = () => {
      overlay.hidden = true;
      overlay.classList.remove("is-visible", "is-closing");
    };
    window.setTimeout(removeOverlay, 520);
    const startFocus = document.querySelector('.hero .btn[href="#catalogo"]') ||
      document.querySelector(".site-header .brand");
    if (startFocus) startFocus.focus({ preventScroll: true });
  }

  closeButton.addEventListener("click", () => closeWelcome(true));
  enterButton.addEventListener("click", () => closeWelcome(true));
  silentButton.addEventListener("click", () => closeWelcome(false));
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeWelcome(true);
    }
    // El anuncio es un diálogo; el Tab permanece en sus controles.
    if (event.key === "Tab") {
      const controls = [closeButton, enterButton, silentButton];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });

  musicButton.addEventListener("click", () => {
    if (music.paused) {
      if (!startSelected) startSelected = true;
      playMusic();
    } else {
      music.pause();
      playingRequested = false;
      pausedByVisibility = false;
      showMusicButton("paused");
    }
  });
  function pauseWhenHidden() {
    if (!dismissed || music.paused) return;
    pausedByVisibility = true;
    music.pause();
    showMusicButton("paused");
  }
  function resumeWhenVisible() {
    if (!dismissed || !pausedByVisibility || document.hidden) return;
    pausedByVisibility = false;
    // Intentamos retomar en el mismo segundo, sin sortear otro inicio.
    // Algunos navegadores pueden requerir un nuevo toque del usuario.
    playMusic();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseWhenHidden();
    else resumeWhenVisible();
  });
  window.addEventListener("pagehide", pauseWhenHidden);
  window.addEventListener("pageshow", resumeWhenVisible);

  music.addEventListener("ended", () => {
    if (!music.loop) showMusicButton("paused");
  });
  music.addEventListener("error", () => {
    if (playingRequested) showMusicButton("ready");
  });

  overlay.hidden = false;
  document.body.classList.add("hangari-welcome-open");
  window.requestAnimationFrame(() => {
    overlay.classList.add("is-visible");
    closeButton.focus({ preventScroll: true });
  });
})();