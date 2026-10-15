/*
 * Finds the boss bar's "Phase: N" marker anywhere on screen and reads N.
 *
 * The marker is located by the shape of the word "Phase:": a set of pixels that must
 * be bright (the white letters) and a set that must be dark (their black shadow). The
 * box behind the text doesn't matter. Offsets are relative to the start of the text
 * on its baseline, which is where Alt1's text reader starts reading.
 *
 * Built from a screenshot at the default interface scaling; a different interface
 * scale won't match.
 */
(function (root) {
	var BRIGHT = [[11, -9], [4, -8], [5, -8], [6, -8], [11, -8], [4, -7], [11, -7], [4, -6], [8, -6], [11, -6], [13, -6], [14, -6], [20, -6], [21, -6], [26, -6], [27, -6], [28, -6], [34, -6], [39, -6], [4, -5], [11, -5], [25, -5], [4, -4], [5, -4], [6, -4], [11, -4], [15, -4], [22, -4], [25, -4], [32, -4], [36, -4], [4, -3], [11, -3], [15, -3], [20, -3], [21, -3], [22, -3], [27, -3], [32, -3], [33, -3], [34, -3], [35, -3], [36, -3], [4, -2], [11, -2], [15, -2], [18, -2], [22, -2], [32, -2], [4, -1], [11, -1], [15, -1], [18, -1], [22, -1], [29, -1], [4, 0], [11, 0], [15, 0], [19, 0], [20, 0], [22, 0], [26, 0], [27, 0], [34, 0], [35, 0], [39, 0]];
	var DARK = [[12, -8], [5, -7], [6, -7], [12, -7], [5, -6], [9, -6], [5, -5], [9, -5], [20, -5], [27, -5], [34, -5], [9, -4], [12, -4], [16, -4], [23, -4], [37, -4], [40, -4], [5, -3], [6, -3], [7, -3], [8, -3], [12, -3], [16, -3], [23, -3], [37, -3], [5, -2], [12, -2], [16, -2], [20, -2], [23, -2], [33, -2], [34, -2], [35, -2], [36, -2], [37, -2], [5, -1], [12, -1], [16, -1], [23, -1], [30, -1], [5, 0], [12, 0], [16, 0], [23, 0], [30, 0], [5, 1], [12, 1], [16, 1], [20, 1], [21, 1], [23, 1], [26, 1], [27, 1], [28, 1], [29, 1], [34, 1], [35, 1], [36, 1], [40, 1]];
	var MIN_BRIGHT = 540; // r+g+b of a letter pixel
	var MAX_DARK = 150; // r+g+b of a shadow pixel
	var MAX_MISSES = 4;
	var TEXT_WHITE = [[255, 255, 255]];

	var minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
	BRIGHT.concat(DARK).forEach(function (p) {
		minDx = Math.min(minDx, p[0]); maxDx = Math.max(maxDx, p[0]);
		minDy = Math.min(minDy, p[1]); maxDy = Math.max(maxDy, p[1]);
	});

	function matchesAt(img, x, y) {
		var data = img.data, w = img.width, misses = 0, i, p, idx;
		for (i = 0; i < BRIGHT.length; i++) {
			p = BRIGHT[i];
			idx = ((y + p[1]) * w + x + p[0]) * 4;
			if (data[idx] + data[idx + 1] + data[idx + 2] < MIN_BRIGHT && ++misses > MAX_MISSES) { return false; }
		}
		for (i = 0; i < DARK.length; i++) {
			p = DARK[i];
			idx = ((y + p[1]) * w + x + p[0]) * 4;
			if (data[idx] + data[idx + 1] + data[idx + 2] > MAX_DARK && ++misses > MAX_MISSES) { return false; }
		}
		return true;
	}

	// Position {x, y} of the start of the "Phase:" text on its baseline in img, or null.
	function find(img) {
		for (var y = -minDy; y < img.height - maxDy; y++) {
			for (var x = -minDx; x < img.width - maxDx; x++) {
				if (matchesAt(img, x, y)) { return { x: x, y: y }; }
			}
		}
		return null;
	}

	// The phase number shown at a position returned by find(), or null if it can't be
	// read there. Needs Alt1's OCR library and its 12pt chat font.
	function read(img, x, y, ocr, font) {
		for (var dx = 0; dx <= 2; dx = dx > 0 ? -dx : -dx + 1) {
			if (x + dx < 0) { continue; }
			var text = ocr.readLine(img, font, TEXT_WHITE, x + dx, y, true, false).text;
			var m = text.match(/Phase\s*:?\s*(\d)/i);
			if (m) { return +m[1]; }
		}
		return null;
	}

	var PhaseMarker = { find: find, read: read, matchesAt: matchesAt, bounds: { minDx: minDx, maxDx: maxDx, minDy: minDy, maxDy: maxDy } };
	if (typeof module !== "undefined") { module.exports = PhaseMarker; }
	else { root.PhaseMarker = PhaseMarker; }
})(this);
