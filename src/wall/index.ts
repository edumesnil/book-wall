import { BookWall } from "./element.js";

export { BookWall };
export type { Labels } from "./labels.js";
export type { Book, Covers, CoverInfo, Library } from "../core/types.js";

if (!customElements.get("book-wall")) customElements.define("book-wall", BookWall);

declare global {
  interface HTMLElementTagNameMap {
    "book-wall": BookWall;
  }
}
