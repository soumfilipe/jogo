// Ponto único que o jogo usa para salvar/carregar.
//
// - save(state):      salva a partida atual no seu arquivo
// - autosave:         grava periodicamente num arquivo separado (auto-<id>)
// - exportFile/importFile: baixar/abrir um .json de qualquer lugar do disco
// - exportCode/importCode: o save inteiro como texto para copiar e colar

import {
  createSave,
  readSave,
  makeSaveId,
  encodeSaveCode,
  decodeSaveCode,
  isValidSaveId,
} from './format.js';

export class SaveManager {
  constructor({ backend, getState, onEvent = () => {} }) {
    this.backend = backend;
    this.getState = getState;
    this.onEvent = onEvent;
    // Metadados da partida em andamento (id do arquivo, data de criação).
    this.current = null;
    this.autosaveTimer = null;
  }

  /** Começa a rastrear uma partida nova (ainda não gravada). */
  startNew(cityName) {
    this.current = { id: makeSaveId(cityName), createdAt: new Date().toISOString() };
  }

  async save({ autosave = false, keepalive = false } = {}) {
    const state = this.getState();
    if (!this.current) this.startNew(state.city.name);
    const id = autosave ? `auto-${this.current.id}`.slice(0, 64) : this.current.id;
    const save = createSave(state, { ...this.current, id, gameId: this.current.id, autosave });
    await this.backend.write(id, save, { keepalive });
    this.onEvent({ type: autosave ? 'autosaved' : 'saved', meta: save.meta });
    return save.meta;
  }

  /** "Salvar como": a partida passa a usar um arquivo novo. */
  async saveAs() {
    this.startNew(this.getState().city.name);
    return this.save();
  }

  async load(id) {
    const text = await this.backend.load(id);
    return this.#adopt(text);
  }

  async list() {
    return this.backend.list();
  }

  async remove(id) {
    await this.backend.remove(id);
    this.onEvent({ type: 'removed', id });
  }

  startAutosave(intervalMs = 60_000) {
    this.stopAutosave();
    this.autosaveTimer = setInterval(() => {
      this.save({ autosave: true }).catch((error) => this.onEvent({ type: 'error', error }));
    }, intervalMs);
  }

  stopAutosave() {
    clearInterval(this.autosaveTimer);
    this.autosaveTimer = null;
  }

  // --- Exportar / importar -------------------------------------------------

  exportFile() {
    const state = this.getState();
    if (!this.current) this.startNew(state.city.name);
    const save = createSave(state, { ...this.current, gameId: this.current.id });
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${save.meta.id}.jogo.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return save.meta;
  }

  async importFile(file) {
    return this.#adopt(await file.text());
  }

  exportCode() {
    const state = this.getState();
    if (!this.current) this.startNew(state.city.name);
    return encodeSaveCode(createSave(state, { ...this.current, gameId: this.current.id }));
  }

  importCode(code) {
    return this.#adopt(decodeSaveCode(code));
  }

  // Valida o save e faz dele a partida atual. Um save automático continua
  // gravando no arquivo da partida original, não no "auto-".
  #adopt(text) {
    const { save, state } = readSave(text);
    const id = isValidSaveId(save.meta.gameId) ? save.meta.gameId : save.meta.id;
    this.current = { id, createdAt: save.meta.createdAt };
    this.onEvent({ type: 'loaded', meta: save.meta });
    return { state, meta: save.meta };
  }
}
