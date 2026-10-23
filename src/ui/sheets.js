// Painéis que sobem de baixo da tela (como o teclado do iOS), usados na
// interface de celular. Fecham ao tocar fora, no botão de voltar do painel ou
// ao deslizar o painel para baixo.

const CLOSE_DRAG_PX = 70;

export class Sheets {
  constructor() {
    this.openId = null;
    for (const sheet of document.querySelectorAll('.sheet')) {
      sheet.querySelector('[data-sheet-close]')?.addEventListener('click', () => this.close());
      this.#swipeToClose(sheet.querySelector('.sheet-panel'));
    }
  }

  toggle(id) {
    if (this.openId === id) this.close();
    else this.open(id);
  }

  open(id) {
    if (this.openId) this.close(true);
    const sheet = document.getElementById(id);
    sheet.hidden = false;
    // Um quadro depois para a transição de subir acontecer.
    requestAnimationFrame(() => sheet.classList.add('open'));
    this.openId = id;
    this.onChange?.(id);
  }

  close(instant = false) {
    if (!this.openId) return;
    const sheet = document.getElementById(this.openId);
    sheet.classList.remove('open');
    const panel = sheet.querySelector('.sheet-panel');
    panel.style.transform = '';
    if (instant) sheet.hidden = true;
    else setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 220);
    this.openId = null;
    this.onChange?.(null);
  }

  // Arrastar o painel para baixo acompanha o dedo; soltando depois de um
  // tanto, fecha.
  #swipeToClose(panel) {
    let start = null;
    panel.addEventListener('pointerdown', (e) => {
      // Só pela "alça" ou pelo título, para não brigar com a rolagem do conteúdo.
      if (!e.target.closest('.grabber, h3')) return;
      start = { y: e.clientY, id: e.pointerId };
      panel.setPointerCapture(e.pointerId);
      panel.style.transition = 'none';
    });
    panel.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      panel.style.transform = `translateY(${Math.max(0, e.clientY - start.y)}px)`;
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dy = e.clientY - start.y;
      start = null;
      panel.style.transition = '';
      if (dy > CLOSE_DRAG_PX) this.close();
      else panel.style.transform = '';
    };
    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
  }
}
