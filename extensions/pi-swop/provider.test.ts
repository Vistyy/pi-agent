import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureOriginalStream,
  isSwopStream,
  markSwopStream,
  type OriginalStreamCache,
} from "./provider-logic";

describe("provider wrapper safety", () => {
  it("marks swop streams", () => {
    const wrapper = () => undefined;
    assert.equal(isSwopStream(wrapper), false);
    assert.equal(markSwopStream(wrapper), wrapper);
    assert.equal(isSwopStream(wrapper), true);
    assert.equal(markSwopStream(wrapper), wrapper);
  });

  it("reuses the cached original on repeated loads", () => {
    const realOriginal = () => "real";
    const accidentalWrapper = markSwopStream(() => "wrapper");
    const cache: OriginalStreamCache = {};
    const applied: Array<() => string> = [];

    const first = captureOriginalStream(realOriginal, cache, (fn) => applied.push(fn));
    const second = captureOriginalStream(accidentalWrapper, cache, (fn) => applied.push(fn));

    assert.equal(first, realOriginal);
    assert.equal(second, realOriginal);
    assert.deepEqual(applied, [realOriginal, realOriginal]);
  });

  it("rejects a swop wrapper when no original is cached", () => {
    const wrapper = markSwopStream(() => "wrapper");
    assert.throws(
      () => captureOriginalStream(wrapper, {}, () => {}),
      /cannot capture pi-swop provider wrapper/,
    );
  });
});
