/*
 * Extra rule for Alt1's chatbox reader.
 *
 * The reader stops at the first character it can't recognise and drops the rest of
 * the line. Some letters of "Lord Vasily Ghrazi" (purple) can't be read, which used to
 * lose his whole message. This rule skips past an unreadable character and carries on
 * reading from the next one it can recognise.
 */
function addSkipUnreadableRule(reader) {
	var maxSkipsPerLine = 3;
	reader.forwardnudges.push({
		match: /\S$/,
		name: "skipunreadable",
		fn: function (ctx) {
			ctx.skips = (ctx.skips || 0) + 1;
			if (ctx.skips > maxSkipsPerLine) { return false; }
			var maxx = Math.min(ctx.imgdata.width - ctx.font.width, ctx.rightx + 3 * ctx.font.width);
			for (var x = ctx.rightx + 1; x < maxx; x++) {
				var data = OCR.readLine(ctx.imgdata, ctx.font, ctx.colors, x, ctx.baseliney, true, false);
				if (data.text.trim().length >= 2) {
					ctx.addfrag({ color: [255, 255, 255], index: -1, text: " ", xstart: ctx.rightx, xend: x });
					data.fragments.forEach(function (f) { ctx.addfrag(f); });
					return true;
				}
			}
			return false;
		}
	});
}
