--[[
  Rapid Attack: Bolt glue. Finds the droplet models as they're rendered, feeds
  them to the Tracker in droplets.lua once per frame, and shows the order of
  prayers in a small panel (ui.html).
]]
local bolt = require("bolt")
bolt.checkversion(1, 0)

local cfg = require("config")
local droplets = require("droplets")

local PANEL_W, PANEL_H = 300, 120

local tracker = droplets.newTracker(cfg)
local learner = nil -- a Learner while learn mode is on
local learnReportAt = 0

-- Settings remembered between sessions, in the plugin's config directory.
local saved = { x = 20, y = 120, w = PANEL_W, h = PANEL_H, vcs = {}, markers = false }

local function loadSettings()
	local text = bolt.loadconfig("settings.cfg")
	if not text then return end
	for key, value in text:gmatch("(%w+)=([^\n]*)") do
		if key == "vcs" then
			for n in value:gmatch("%d+") do saved.vcs[#saved.vcs + 1] = tonumber(n) end
		elseif key == "markers" then
			saved.markers = value == "1"
		elseif saved[key] ~= nil then
			saved[key] = tonumber(value) or saved[key]
		end
	end
end

local function saveSettings()
	bolt.saveconfig("settings.cfg", table.concat({
		"x=" .. saved.x, "y=" .. saved.y, "w=" .. saved.w, "h=" .. saved.h,
		"vcs=" .. table.concat(saved.vcs, ","), "markers=" .. (saved.markers and "1" or "0"),
	}, "\n"))
end

loadSettings()

-- Vertex counts of the droplet models: the ones in config.lua plus the ones picked
-- in learn mode.
local dropletVcs = {}
local function updateDropletVcs()
	dropletVcs = {}
	for _, n in ipairs(cfg.dropletVertexCounts) do dropletVcs[n] = true end
	for _, n in ipairs(saved.vcs) do dropletVcs[n] = true end
end
updateDropletVcs()

local function calibrated()
	return next(dropletVcs) ~= nil
end

-- Player position from the last frame, or nil before Bolt knows it.
local me = nil
local function updatePlayerPosition()
	local p = bolt.playerposition()
	local x, y, z = p:get()
	me = (x ~= 0 or z ~= 0) and { x = x, y = y, z = z } or nil
end

-- What was seen while the current frame was rendered.
local frameDroplets, frameModels = {}, {}
local viewproj = nil

-- A model's average colour (vertex colour times texture) and the world position of
-- its centre, from a sample of its vertices.
local function analyse(event, vc, modelmatrix)
	local step = math.max(1, math.floor(vc / cfg.sampleVertices))
	local tw, th = 0, 0
	if cfg.sampleTexture then tw, th = event:texturesize() end
	local r, g, b, sx, sy, sz, n = 0, 0, 0, 0, 0, 0, 0
	for i = 1, vc, step do
		local cr, cg, cb = event:vertexcolour(i)
		if tw > 0 then
			local ax, ay, aw, ah = event:atlasxywh(event:vertexmeta(i))
			if aw > 0 and ah > 0 then
				local u, v = event:vertexuv(i)
				local px, py = ax + math.floor((u % 1) * aw), ay + math.floor((v % 1) * ah)
				if px >= 0 and py >= 0 and px < tw and py < th then
					local tr, tg, tb = event:texturedata(px, py, 4):byte(1, 3)
					cr, cg, cb = cr * tr / 255, cg * tg / 255, cb * tb / 255
				end
			end
		end
		local x, y, z = event:vertexpoint(i):get()
		r, g, b, sx, sy, sz, n = r + cr, g + cg, b + cb, sx + x, sy + y, sz + z, n + 1
	end
	local colour = droplets.classify(r / n, g / n, b / n, cfg)
	if not colour then return nil end
	local x, y, z = bolt.point(sx / n, sy / n, sz / n):transform(modelmatrix):get()
	return colour, x, y, z
end

bolt.onrender3d(function (event)
	if not me then return end
	local vc = event:vertexcount()
	local isDroplet = dropletVcs[vc]
	if not isDroplet and not (learner and vc <= cfg.learnMaxVertices) then return end
	local modelmatrix = event:modelmatrix()
	local ox, _, oz = bolt.point(0, 0, 0):transform(modelmatrix):get()
	local dx, dz = ox - me.x, oz - me.z
	if dx * dx + dz * dz > cfg.scanRadius * cfg.scanRadius then return end
	local colour, x, y, z = analyse(event, vc, modelmatrix)
	if not colour then return end
	if isDroplet then
		frameDroplets[#frameDroplets + 1] = { colour = colour, x = x, y = y, z = z }
		viewproj = event:viewprojmatrix()
	end
	if learner then
		frameModels[#frameModels + 1] = { vc = vc, colour = colour, x = x, y = y, z = z }
	end
end)

-- Minimal JSON for the messages to the panel (strings, numbers, booleans, arrays
-- and string-keyed tables).
local function json(v)
	local kind = type(v)
	if kind == "string" then
		return '"' .. v:gsub('[%c"\\]', function (c) return string.format("\\u%04x", c:byte()) end) .. '"'
	end
	if kind == "number" or kind == "boolean" then return tostring(v) end
	if kind ~= "table" then return "null" end
	local parts = {}
	if #v > 0 or next(v) == nil then
		for i = 1, #v do parts[i] = json(v[i]) end
		return "[" .. table.concat(parts, ",") .. "]"
	end
	for k, x in pairs(v) do parts[#parts + 1] = json(tostring(k)) .. ":" .. json(x) end
	return "{" .. table.concat(parts, ",") .. "}"
end

local panel = bolt.createembeddedbrowser(saved.x, saved.y, saved.w, saved.h, "plugin://ui.html")
local lastState = nil

local function status()
	if learner then return "Learning: do a Rapid Attack, then pick the droplets" end
	if not calibrated() then return "No droplet models picked yet: use Learn" end
	if not me then return "Waiting for your position" end
	return "Watching for droplets"
end

local function sendState()
	local picked = {}
	for _, n in ipairs(saved.vcs) do picked[#picked + 1] = n end
	local state = json({
		type = "state", status = status(), learning = learner ~= nil, markers = saved.markers,
		prayers = cfg.prayers, picked = picked, seq = tracker:sequence() or false,
	})
	if state ~= lastState then
		lastState = state
		panel:sendmessage(state)
	end
end

local function sendLearnReport()
	panel:sendmessage(json({ type = "learn", candidates = learner:report(cfg.learnReportSize) }))
end

local function setPicked(vc, on)
	for i, n in ipairs(saved.vcs) do
		if n == vc then table.remove(saved.vcs, i) break end
	end
	if on then saved.vcs[#saved.vcs + 1] = vc end
	saveSettings()
	updateDropletVcs()
end

-- A made-up attack, to check the panel without being at the boss.
local function testAttack(now)
	local colours = { "red", "green", "blue" }
	local entries = {}
	for i = 1, 3 do
		entries[i] = { colour = colours[math.random(3)], eta = now + i, done = false }
	end
	tracker.attack = { entries = entries, changedAt = now, finishedAt = now }
end

panel:onmessage(function (message)
	local now = bolt.time() / 1000
	local command, arg = message:match("^(%S+)%s*(.*)$")
	if command == "learn" then
		if arg == "on" then
			learner = droplets.newLearner(cfg)
			learnReportAt = 0
		else
			learner = nil
		end
	elseif command == "pick" or command == "unpick" then
		local vc = tonumber(arg)
		if vc then setPicked(vc, command == "pick") end
	elseif command == "markers" then
		saved.markers = arg == "on"
		saveSettings()
	elseif command == "test" then
		testAttack(now)
	elseif command == "ready" then
		lastState = nil
	end
	sendState()
end)

panel:onreposition(function (event)
	saved.x, saved.y, saved.w, saved.h = event:xywh()
	saveSettings()
end)

-- Markers over the droplets, to check what's detected: a large square with a
-- white border over each droplet coming at you, a small faded one over the others.
local markerSurfaces = {}
for colour, rgba in pairs({
	red = "\xFF\x40\x40\xFF", green = "\x40\xFF\x40\xFF", blue = "\x40\x80\xFF\xFF", white = "\xFF\xFF\xFF\xFF",
}) do
	markerSurfaces[colour] = bolt.createsurfacefromrgba(8, 8, string.rep(rgba, 64))
end

local function drawMarker(colour, px, py, size)
	markerSurfaces[colour]:drawtoscreen(0, 0, 8, 8, px - size / 2, py - size / 2, size, size)
end

local function drawMarkers()
	if not viewproj then return end
	for _, t in ipairs(tracker.tracks) do
		local px, py, depth = bolt.point(t.x, t.y, t.z):transform(viewproj):toscreen()
		if depth >= -1 and depth <= 1 then
			local surface = markerSurfaces[t.colour]
			if t.entry then
				drawMarker("white", px, py, 22)
				surface:setalpha(1)
				drawMarker(t.colour, px, py, 16)
			else
				surface:setalpha(0.5)
				drawMarker(t.colour, px, py, 8)
			end
		end
	end
end

bolt.onswapbuffers(function (event)
	local now = bolt.time() / 1000
	updatePlayerPosition()
	tracker:update(frameDroplets, me, now)
	if learner then
		learner:update(frameModels, me, now)
		if now >= learnReportAt then
			learnReportAt = now + 1000
			sendLearnReport()
		end
	end
	frameDroplets, frameModels = {}, {}
	if saved.markers then drawMarkers() end
	sendState()
end)
