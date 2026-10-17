--[[
  Rapid Attack droplet logic: which droplets are coming at you, and in what order.

  No Bolt calls in here, so it can be tested outside the game (see
  test/droplets.test.lua). main.lua turns 3D renders into detections
  ({x, y, z, colour}) once per frame and feeds them to a Tracker.

  Positions are world coordinates: 512 units per tile, Y is height.
  Times are in milliseconds.
]]
local M = {}

local sqrt = math.sqrt

-- The colour of a droplet from its average red, green and blue (0-1), or nil if no
-- channel stands out enough.
function M.classify(r, g, b, cfg)
	local ratio, low = cfg.colourRatio, cfg.minBrightness
	if r >= low and r >= g * ratio and r >= b * ratio then return "red" end
	if g >= low and g >= r * ratio and g >= b * ratio then return "green" end
	if b >= low and b >= r * ratio and b >= g * ratio then return "blue" end
	return nil
end

local function hdist(ax, az, bx, bz)
	local dx, dz = ax - bx, az - bz
	return sqrt(dx * dx + dz * dz)
end

-- Whether a droplet is coming at the player at `me`: it's above or next to them
-- (Vasily's droplets rain straight down on his target), or it's moving sideways on
-- a path that passes next to them (Karmina's are fired at hers).
function M.aimedAt(t, me, cfg)
	if hdist(t.x, t.z, me.x, me.z) <= cfg.ownRadius then return true end
	local hv2 = t.vx * t.vx + t.vz * t.vz
	if hv2 < cfg.minSideSpeed * cfg.minSideSpeed then return false end
	-- Time until the droplet's sideways path is closest to the player.
	local at = ((me.x - t.x) * t.vx + (me.z - t.z) * t.vz) / hv2
	if at <= 0 then return false end
	return hdist(t.x + t.vx * at, t.z + t.vz * at, me.x, me.z) <= cfg.ownRadius
end

-- When a droplet should reach the player: its distance to them over its speed
-- towards them. Worked out again every frame until it hits. One that is hovering or barely moving counts as moving at
-- minSpeed, so a group that appears all at once is ordered nearest first.
function M.eta(t, me, now, cfg)
	local dx, dy, dz = me.x - t.x, me.y + cfg.hitHeight - t.y, me.z - t.z
	local d = sqrt(dx * dx + dy * dy + dz * dz)
	local towards = d > 0 and (t.vx * dx + t.vy * dy + t.vz * dz) / d or 0
	return now + d / math.max(towards, cfg.minSpeed)
end

-- Pairs each detection with the nearest live track of the same colour (closest
-- pairs first). Returns a table: detection index -> track.
local function match(tracks, detections, maxDist)
	local pairs_ = {}
	for i, d in ipairs(detections) do
		for _, t in ipairs(tracks) do
			if t.colour == d.colour then
				local dx, dy, dz = d.x - t.x, d.y - t.y, d.z - t.z
				local dist = sqrt(dx * dx + dy * dy + dz * dz)
				if dist <= maxDist then pairs_[#pairs_ + 1] = { i = i, t = t, dist = dist } end
			end
		end
	end
	table.sort(pairs_, function (a, b) return a.dist < b.dist end)
	local byDetection, usedTrack = {}, {}
	for _, p in ipairs(pairs_) do
		if not byDetection[p.i] and not usedTrack[p.t] then
			byDetection[p.i] = p.t
			usedTrack[p.t] = true
		end
	end
	return byDetection
end

local Tracker = {}
Tracker.__index = Tracker

function M.newTracker(cfg)
	return setmetatable({ cfg = cfg, tracks = {}, nextId = 1, attack = nil }, Tracker)
end

local function sortEntries(attack)
	table.sort(attack.entries, function (a, b) return a.eta < b.eta end)
end

function Tracker:addToAttack(t, me, now)
	local attack = self.attack
	if not attack or attack.finishedAt then
		attack = { entries = {}, changedAt = now }
		self.attack = attack
	end
	t.entry = { colour = t.colour, eta = M.eta(t, me, now, self.cfg), done = false }
	attack.entries[#attack.entries + 1] = t.entry
	attack.changedAt = now
end

function Tracker:removeFromAttack(t, now)
	local entries = self.attack.entries
	for i, e in ipairs(entries) do
		if e == t.entry then table.remove(entries, i) break end
	end
	t.entry = nil
	self.attack.changedAt = now
end

-- One frame: the droplets seen this frame, the player's position (or nil if not
-- known yet) and the time.
function Tracker:update(detections, me, now)
	local cfg = self.cfg
	local byDetection = match(self.tracks, detections, cfg.matchDist)
	local seen = {}
	for i, d in ipairs(detections) do
		local t = byDetection[i]
		if t then
			local dt = now - t.lastSeen
			if dt > 0 then
				local vx, vy, vz = (d.x - t.x) / dt, (d.y - t.y) / dt, (d.z - t.z) / dt
				local k = t.samples > 1 and 0.5 or 1
				t.vx, t.vy, t.vz = t.vx + (vx - t.vx) * k, t.vy + (vy - t.vy) * k, t.vz + (vz - t.vz) * k
			end
			t.x, t.y, t.z, t.lastSeen, t.samples = d.x, d.y, d.z, now, t.samples + 1
		else
			t = { id = self.nextId, colour = d.colour, x = d.x, y = d.y, z = d.z,
				vx = 0, vy = 0, vz = 0, firstSeen = now, lastSeen = now, samples = 1, misses = 0 }
			self.nextId = self.nextId + 1
			self.tracks[#self.tracks + 1] = t
		end
		seen[t] = true
	end

	local live = {}
	for _, t in ipairs(self.tracks) do
		if now - t.lastSeen > cfg.lostMs then
			-- Gone: it either hit the player or wasn't theirs after all.
			if t.entry then
				if me and hdist(t.x, t.z, me.x, me.z) <= cfg.landRadius then
					t.entry.done = true
					t.entry.eta = t.lastSeen
					self.attack.changedAt = now
				else
					self:removeFromAttack(t, now)
				end
			end
		else
			live[#live + 1] = t
			-- Wait for a second sighting, so its speed is known.
			if me and seen[t] and t.samples >= 2 then
				local aimed = M.aimedAt(t, me, cfg)
				if not t.entry and aimed then
					self:addToAttack(t, me, now)
				elseif t.entry and not aimed then
					-- Looked like it was coming here but has turned out not to be.
					t.misses = t.misses + 1
					if t.misses >= cfg.missFrames then self:removeFromAttack(t, now) end
				elseif aimed then
					t.misses = 0
					t.entry.eta = M.eta(t, me, now, cfg)
				end
			end
		end
	end
	self.tracks = live

	local attack = self.attack
	if attack then
		sortEntries(attack)
		if not attack.finishedAt then
			local pending = false
			for _, e in ipairs(attack.entries) do
				if not e.done then pending = true break end
			end
			if #attack.entries == 0 then
				self.attack = nil
			elseif not pending and now - attack.changedAt >= cfg.attackGapMs then
				attack.finishedAt = now
			end
		elseif now - attack.finishedAt >= cfg.holdMs then
			self.attack = nil
		end
	end
end

-- What to show: the colours in the order they'll hit, which ones have already
-- hit, the index of the next one, and whether the attack is over.
function Tracker:sequence()
	local attack = self.attack
	if not attack then return nil end
	local out = { colours = {}, done = {}, next = nil, finished = attack.finishedAt ~= nil }
	for i, e in ipairs(attack.entries) do
		out.colours[i] = e.colour
		out.done[i] = e.done
		if not e.done and not out.next then out.next = i end
	end
	return out
end

-- Learn mode: watches every small, strongly coloured model near the player and
-- keeps statistics per (vertex count, colour), to find which models are the
-- droplets. Droplets come and go in a few seconds, often near the player, unlike
-- scenery.
local Learner = {}
Learner.__index = Learner

function M.newLearner(cfg)
	return setmetatable({ cfg = cfg, tracks = {}, stats = {} }, Learner)
end

function Learner:finish(t, me)
	local key = t.vc .. " " .. t.colour
	local s = self.stats[key]
	if not s then
		s = { vc = t.vc, colour = t.colour, appearances = 0, brief = 0, nearYou = 0, lifeMs = 0, moved = 0 }
		self.stats[key] = s
	end
	local life = t.lastSeen - t.firstSeen
	s.appearances = s.appearances + 1
	s.lifeMs = s.lifeMs + life
	local dx, dy, dz = t.x - t.x0, t.y - t.y0, t.z - t.z0
	s.moved = s.moved + sqrt(dx * dx + dy * dy + dz * dz)
	if life <= self.cfg.learnBriefMs then s.brief = s.brief + 1 end
	if me and hdist(t.x, t.z, me.x, me.z) <= self.cfg.landRadius then s.nearYou = s.nearYou + 1 end
end

-- detections: {vc, colour, x, y, z}
function Learner:update(detections, me, now)
	local cfg = self.cfg
	-- Same matching as the tracker, but a vertex count must match as well as the colour.
	local byKind = {}
	for i, d in ipairs(detections) do
		local kind = d.vc .. " " .. d.colour
		byKind[kind] = byKind[kind] or { detections = {}, index = {}, tracks = {} }
		local k = byKind[kind]
		k.detections[#k.detections + 1] = d
		k.index[#k.detections] = i
	end
	for _, t in ipairs(self.tracks) do
		local k = byKind[t.vc .. " " .. t.colour]
		if k then k.tracks[#k.tracks + 1] = t end
	end
	for _, k in pairs(byKind) do
		local byDetection = match(k.tracks, k.detections, cfg.matchDist)
		for i, d in ipairs(k.detections) do
			local t = byDetection[i]
			if t then
				t.x, t.y, t.z, t.lastSeen = d.x, d.y, d.z, now
			else
				self.tracks[#self.tracks + 1] = { vc = d.vc, colour = d.colour, x = d.x, y = d.y, z = d.z,
					x0 = d.x, y0 = d.y, z0 = d.z, firstSeen = now, lastSeen = now }
			end
		end
	end
	local live = {}
	for _, t in ipairs(self.tracks) do
		if now - t.lastSeen > cfg.lostMs then self:finish(t, me) else live[#live + 1] = t end
	end
	self.tracks = live
end

-- The likeliest droplet models first: ones that keep briefly appearing (and land
-- next to the player), ahead of ones that stay around.
function Learner:report(limit)
	local list = {}
	for _, s in pairs(self.stats) do
		list[#list + 1] = {
			vc = s.vc, colour = s.colour, appearances = s.appearances, brief = s.brief, nearYou = s.nearYou,
			avgLifeMs = s.lifeMs / s.appearances, avgMovedTiles = s.moved / s.appearances / 512,
			score = s.brief * 2 + s.nearYou * 3 - (s.appearances - s.brief),
		}
	end
	table.sort(list, function (a, b)
		if a.score ~= b.score then return a.score > b.score end
		return a.vc < b.vc
	end)
	while limit and #list > limit do table.remove(list) end
	return list
end

return M
