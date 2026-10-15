const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const PhaseMarker = require("../phasemarker.js");

// The boss bar from a real screenshot (400x106, RGBA), showing "Phase: 1".
function bossBar() {
	const data = new Uint8ClampedArray(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "fixtures/bossbar-phase1.rgba.gz"))));
	return { width: 400, height: 106, data };
}

function blank(width, height, rgb) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < data.length; i += 4) { data.set([...rgb, 255], i); }
	return { width, height, data };
}

// Paste img into a bigger screen at (x, y).
function paste(screen, img, x, y) {
	for (let r = 0; r < img.height; r++) {
		screen.data.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * screen.width + x) * 4);
	}
	return screen;
}

test("finds the Phase: text in the boss bar", () => {
	assert.deepStrictEqual(PhaseMarker.find(bossBar()), { x: 23, y: 89 });
});

test("finds the boss bar wherever it is on screen", () => {
	const screen = paste(blank(1280, 720, [35, 30, 28]), bossBar(), 611, 437);
	assert.deepStrictEqual(PhaseMarker.find(screen), { x: 611 + 23, y: 437 + 89 });
});

test("finds nothing on a screen without the boss bar", () => {
	assert.strictEqual(PhaseMarker.find(blank(640, 360, [35, 30, 28])), null);
	assert.strictEqual(PhaseMarker.find(blank(640, 360, [255, 255, 255])), null);
});
