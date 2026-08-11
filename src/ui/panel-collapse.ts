export class PanelCollapseState {
  #collapsed: boolean;
  #expandWhenMarked: boolean;

  constructor(hasInitialParameters: boolean) {
    this.#collapsed = !hasInitialParameters;
    this.#expandWhenMarked = !hasInitialParameters;
  }

  get collapsed(): boolean {
    return this.#collapsed;
  }

  syncParameters(start: number | null, end: number | null): boolean {
    if (this.#expandWhenMarked && (start !== null || end !== null)) {
      this.#collapsed = false;
      this.#expandWhenMarked = false;
    }
    return this.#collapsed;
  }

  toggle(): boolean {
    this.#expandWhenMarked = false;
    this.#collapsed = !this.#collapsed;
    return this.#collapsed;
  }
}
