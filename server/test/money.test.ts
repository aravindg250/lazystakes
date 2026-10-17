import { describe, expect, it } from "vitest";

import * as app from "../../src/types";
import * as server from "../src/money";

describe("server money helpers match the app's", () => {
  it("has the same stake limits", () => {
    expect(server.MIN_STAKE_CENTS).toBe(app.MIN_STAKE_CENTS);
    expect(server.MAX_STAKE_CENTS).toBe(app.MAX_STAKE_CENTS);
  });

  it("formats money the same way", () => {
    for (const cents of [0, 1, 99, 100, 500, 550, 1999, 2000, 123456]) {
      for (const showCents of [true, false]) {
        expect(server.formatMoney(cents, showCents)).toBe(app.formatMoney(cents, showCents));
      }
    }
  });
});
