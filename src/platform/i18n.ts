interface I18nApi {
  i18n?: {
    getMessage(key: string, substitutions?: string | string[]): string;
    getUILanguage?(): string;
  };
}

const fallbackMessages: Record<string, string> = {
  appSubtitle: "Biblioteca de fragmentos",
  currentFragment: "Fragmento actual",
  showPanel: "Mostrar panel",
  currentNeedsPoints: "Marca A y B para guardar un fragmento.",
  videoCurrent: "Vídeo actual",
  fragmentDefault: "Fragmento",
  youtubeVideo: "Vídeo de YouTube",
  name: "Nombre",
  fragmentNamePlaceholder: "Ej. Solo, compases 8–12",
  folder: "Carpeta",
  saveFragment: "Guardar fragmento",
  library: "Biblioteca",
  fragmentCount: "$1 fragmento",
  fragmentsCount: "$1 fragmentos",
  editFragment: "Editar fragmento",
  fragmentDetails: "Detalles del fragmento",
  reviewFragment: "Revisa y guarda",
  editNamedFragment: "Editar $1",
  saveNamedFragment: "Guardar $1",
  startSeconds: "A (s)",
  endSeconds: "B (s)",
  speed: "Velocidad",
  closeEditor: "Cerrar editor",
  delete: "Eliminar",
  open: "Abrir",
  saveChanges: "Guardar cambios",
  changesSaved: "Cambios guardados.",
  confirmDelete: "Confirmar eliminación",
  rootLibrary: "Biblioteca (raíz)",
  createFolderInside: "Crear carpeta dentro de $1",
  deleteFolder: "Eliminar carpeta $1",
  confirmDeleteFolder: "Confirmar eliminación de la carpeta $1",
  expandFolder: "Expandir $1",
  collapseFolder: "Contraer $1",
  emptyFolder: "Carpeta vacía",
  newFolderName: "Nombre de la carpeta",
  createFolder: "Crear carpeta",
  cancel: "Cancelar",
  savedFragment: "Fragmento guardado.",
  alreadySaved: "Este fragmento ya está guardado.",
  savedAs: "Guardado como $1",
  updateParameters: "Actualizar A, B y velocidad",
  parametersUpToDate: "Parámetros actualizados",
  parametersUpdated: "Parámetros del fragmento actualizados.",
  movedToFolder: "Fragmento movido a $1.",
  duplicateFragment: "Ya existe un fragmento con estos parámetros.",
  invalidEditorSegment: "B debe estar al menos $1 s después de A.",
  invalidEditorBounds: "A y B deben estar entre 0 y $1 segundos.",
  invalidEditorName: "Escribe un nombre para el fragmento.",
  invalidEditorRate: "La velocidad debe estar entre 0,25× y 4×.",
  widgetMinimize: "Minimizar",
  widgetExpand: "Expandir",
  widgetHide: "Ocultar controles en este vídeo",
  widgetSetStart: "Usar el tiempo actual como A",
  widgetSetEnd: "Usar el tiempo actual como B",
  widgetStartBack: "Retroceder A 0,1 s",
  widgetStartForward: "Avanzar A 0,1 s",
  widgetEndBack: "Retroceder B 0,1 s",
  widgetEndForward: "Avanzar B 0,1 s",
  widgetActivate: "Activar loop",
  widgetStop: "Detener loop",
  widgetSave: "Guardar",
  widgetSaveTitle: "Guardar fragmento",
  widgetSaved: "Guardado",
  detachSavedLoop: "Desvincular para crear otro fragmento",
  bookmarkDetached: "Listo para crear un fragmento nuevo",
  shortcutsHint: "⌥/Alt + ⇧ + A/B/L",
  pausedDuringAd: "Pausado durante el anuncio",
  waitingForAd: "Esperando a que termine el anuncio…",
  loopReady: "Loop listo",
  pointAMarked: "Punto A marcado",
  pointBMarked: "Punto B marcado",
  speedSet: "Velocidad: $1×",
  loopActivated: "Loop activado",
  loopStopped: "Loop detenido",
  validationMissing: "Marca primero los puntos A y B.",
  validationInvalid: "Los límites del fragmento no son válidos.",
  validationTooShort: "El fragmento debe durar al menos $1 s.",
  validationOutOfRange: "El punto B está fuera del vídeo.",
  loopUnavailable: "No se puede activar el loop.",
  bookmarkLoaded: "Fragmento: $1",
  loopLoadedPressPlay: "Loop cargado; pulsa reproducir",
  shareLoop: "Copiar enlace del loop",
  linkCopied: "Enlace del loop copiado.",
  copyFailed: "No se pudo copiar el enlace.",
  sharedLoopLoaded: "Loop compartido cargado",
  operationFailed: "No se pudo completar la operación. Inténtalo de nuevo.",
  libraryLoadFailed: "No se pudo cargar la biblioteca. Vuelve a abrir el menú en unos segundos."
};

const extensionGlobal = globalThis as typeof globalThis & {
  browser?: I18nApi;
  chrome?: I18nApi;
};
const i18nApi = extensionGlobal.browser?.i18n ?? extensionGlobal.chrome?.i18n;

export function t(key: string, substitutions: string[] = []): string {
  const translated = i18nApi?.getMessage(key, substitutions);
  const template = translated?.trim() ? translated : (fallbackMessages[key] ?? key);
  return substitutions.reduce(
    (message, substitution, index) => message.replaceAll(`$${index + 1}`, substitution),
    template
  );
}

export function localizeDocument(root: ParentNode = document): void {
  const language = i18nApi?.getUILanguage?.() ?? "es";
  if (root === document) {
    document.documentElement.lang = language;
  } else if (root instanceof ShadowRoot) {
    root.host.setAttribute("lang", language);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n ?? "");
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder ?? ""));
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel ?? ""));
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    element.setAttribute("title", t(element.dataset.i18nTitle ?? ""));
  }
}
