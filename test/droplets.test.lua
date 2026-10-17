-- Tests for bolt/droplets.lua. Run from the repository root with: luajit test/droplets.test.lua
package.path = "bolt/?.lua;" .. package.path
local droplets = require("droplets")
local config = require("config")

local TILE = 512
local failures, count = 0, 0

local function test(name, fn)
	count = count + 1
	local ok, err = pcall(fn)
	if ok then
		print("ok - " .. name)
	else
		failures = failures + 1
		print("FAIL - " .. name .. "\n  " .. tostring(err))
	end
end

local function eq(actual, expected, what)
	if actual ~= expected then
		error(string.format("%s: expected %s, got %s", what or "value", tostring(expected), tostring(actual)), 2)
	end
end

local function list(t) return table.concat(t, ",") end

-- Where the two players stand: you, and your duo partner 6 tiles east.
local ME = { x = 3000 * TILE + 256, y = 0, z = 2000 * TILE + 256 }
local PARTNER = { x = ME.x + 6 * TILE, y = 0, z = ME.z }

-- A droplet that falls from `height` tiles onto `target` (Vasily), appearing at
-- `at` ms and landing at `speed` tiles per second.
local function rain(target, colour, at, height, speed)
	local fall = height * TILE
	local v = speed * TILE / 1000
	return { colour = colour, from = at, to = at + fall / v,
		x = target.x + 40, y = target.y + fall, z = target.z - 30, vx = 0, vy = -v, vz = 0 }
end

-- A droplet fired from `source` at `target` (Karmina), appearing at `at` ms.
local function projectile(source, target, colour, at, speed)
	local dx, dz = target.x - source.x, target.z - source.z
	local d = math.sqrt(dx * dx + dz * dz)
	local v = speed * TILE / 1000
	return { colour = colour, from = at, to = at + d / v,
		x = source.x, y = source.y + 2 * TILE, z = source.z, vx = dx / d * v, vy = 0, vz = dz / d * v }
end

-- Plays the droplets frame by frame and returns the tracker. `check(tracker, t)`
-- runs after every frame.
local function play(objects, ms, check, frameMs)
	frameMs = frameMs or 16
	local tracker = droplets.newTracker(config)
	for t = 0, ms, frameMs do
		local detections = {}
		for _, o in ipairs(objects) do
			if t >= o.from and t < o.to then
				local dt = t - o.from
				detections[#detections + 1] = { colour = o.colour, x = o.x + o.vx * dt, y = o.y + o.vy * dt, z = o.z + o.vz * dt }
			end
		end
		tracker:update(detections, ME, t)
		if check then check(tracker, t) end
	end
	return tracker
end

-- The sequence as text: colours in order, a "*" after ones that have hit.
local function seqText(tracker)
	local seq = tracker:sequence()
	if not seq then return "none" end
	local parts = {}
	for i, c in ipairs(seq.colours) do parts[i] = c .. (seq.done[i] and "*" or "") end
	return list(parts)
end

test("classify picks the dominant channel", function ()
	eq(droplets.classify(0.9, 0.1, 0.1, config), "red")
	eq(droplets.classify(0.1, 0.8, 0.2, config), "green")
	eq(droplets.classify(0.1, 0.3, 0.9, config), "blue")
	eq(droplets.classify(0.8, 0.7, 0.6, config), nil, "greyish")
	eq(droplets.classify(0.05, 0.01, 0.01, config), nil, "too dark")
end)

test("Vasily's rain: only the droplets falling on you count", function ()
	local objects = {
		rain(ME, "green", 0, 6, 6), rain(ME, "red", 1200, 6, 6), rain(ME, "blue", 2400, 6, 6),
		rain(PARTNER, "blue", 0, 6, 6), rain(PARTNER, "blue", 1200, 6, 6), rain(PARTNER, "red", 2400, 6, 6),
	}
	local seen = {}
	play(objects, 5000, function (tracker, t)
		local text = seqText(tracker)
		if seen[#seen] ~= text then seen[#seen + 1] = text end
	end)
	eq(table.concat(seen, " | "), "none | green | green,red | green*,red | green*,red,blue | green*,red*,blue | green*,red*,blue*",
		"sequence over time")
end)

test("Karmina's projectiles: fired at you count, fired at your partner don't", function ()
	local karmina = { x = ME.x + 3 * TILE, y = 0, z = ME.z + 8 * TILE }
	local objects = {
		projectile(karmina, ME, "red", 0, 10), projectile(karmina, ME, "red", 1200, 10), projectile(karmina, ME, "green", 2400, 10),
		projectile(karmina, PARTNER, "blue", 0, 10), projectile(karmina, PARTNER, "green", 1200, 10), projectile(karmina, PARTNER, "blue", 2400, 10),
	}
	local final
	local tracker = play(objects, 6000, function (tracker) final = seqText(tracker) end)
	eq(final, "red*,red*,green*", "sequence")
	eq(tracker.attack.finishedAt ~= nil, true, "attack finished")
end)

test("droplets that appear together are ordered nearest first", function ()
	-- Three droplets appear at once at different heights and fall together.
	local objects = { rain(ME, "blue", 0, 8, 6), rain(ME, "red", 0, 4, 6), rain(ME, "green", 0, 6, 6) }
	local early
	play(objects, 2000, function (tracker, t) if t == 32 then early = seqText(tracker) end end)
	eq(early, "red,green,blue", "order straight away")
end)

test("both knights at you: rain and projectiles are merged in hit order", function ()
	local karmina = { x = ME.x - 8 * TILE, y = 0, z = ME.z }
	-- Rain lands ~1s after appearing; the projectiles take 0.8s.
	local objects = {
		rain(ME, "red", 0, 6, 6), rain(ME, "blue", 1200, 6, 6), rain(ME, "green", 2400, 6, 6),
		projectile(karmina, ME, "green", 600, 10), projectile(karmina, ME, "green", 1800, 10), projectile(karmina, ME, "blue", 3000, 10),
	}
	local final
	play(objects, 4500, function (tracker) final = seqText(tracker) end)
	eq(final, "red*,green*,blue*,green*,green*,blue*", "sequence")
end)

test("the order stays up for a while after the attack, then clears", function ()
	local objects = { rain(ME, "red", 0, 6, 6), rain(ME, "green", 1200, 6, 6), rain(ME, "blue", 2400, 6, 6) }
	local landed = 2400 + 1000
	local tracker = play(objects, landed + config.attackGapMs + config.holdMs - 500)
	eq(seqText(tracker), "red*,green*,blue*", "still shown")
	tracker:update({}, ME, landed + config.attackGapMs + config.holdMs + 500)
	eq(seqText(tracker), "none", "cleared")
end)

test("the next attack starts a new order", function ()
	local objects = { rain(ME, "red", 0, 6, 6), rain(ME, "blue", 6000, 6, 6) }
	local final
	play(objects, 6500, function (tracker) final = seqText(tracker) end)
	eq(final, "blue", "only the new droplet")
end)

test("a slow frame rate still works", function ()
	local karmina = { x = ME.x, y = 0, z = ME.z + 8 * TILE }
	local objects = {
		projectile(karmina, ME, "blue", 0, 10), projectile(karmina, ME, "red", 1200, 10), projectile(karmina, ME, "red", 2400, 10),
		projectile(karmina, PARTNER, "green", 0, 10), projectile(karmina, PARTNER, "green", 1200, 10), projectile(karmina, PARTNER, "green", 2400, 10),
	}
	local final
	play(objects, 4000, function (tracker) final = seqText(tracker) end, 100)
	eq(final, "blue*,red*,red*", "sequence at 10 fps")
end)

test("learn mode ranks brief droplets above scenery", function ()
	local learner = droplets.newLearner(config)
	for t = 0, 8000, 16 do
		local detections = {
			-- a red torch that is always there
			{ vc = 300, colour = "red", x = ME.x + 2 * TILE, y = 0, z = ME.z },
		}
		-- a 96-vertex droplet falling on you every 1.2 s, for 1 s
		if t % 1200 < 1000 then
			detections[#detections + 1] = { vc = 96, colour = "green", x = ME.x, y = 3000 - (t % 1200) * 3, z = ME.z }
		end
		learner:update(detections, ME, t)
	end
	local report = learner:report(5)
	eq(report[1].vc, 96, "top candidate")
	eq(report[1].colour, "green", "top candidate colour")
	eq(report[1].nearYou, 6, "droplets landed next to you")
end)

print(string.format("%d/%d passed", count - failures, count))
os.exit(failures == 0 and 0 or 1)
