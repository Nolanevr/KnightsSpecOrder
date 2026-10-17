--[[
  Settings for the Rapid Attack plugin. Distances are in world units: 512 units
  is one tile. Times are in milliseconds.
]]
local TILE = 512

return {
	-- The vertex counts of the droplet models. Bolt can't see what a model is, only
	-- its shape and colour, so the droplets are recognised by their vertex count
	-- (all three colours may well share one). Find them with "Learn" in the panel
	-- (see README.md); the ones picked there are saved and added to this list.
	dropletVertexCounts = {},

	-- What to pray against each colour.
	prayers = {
		red = "Melee",
		green = "Ranged",
		blue = "Magic",
	},

	-- A droplet's colour is the channel that is at least colourRatio times the other
	-- two, and at least minBrightness (0-1).
	colourRatio = 1.4,
	minBrightness = 0.12,
	-- Also multiply in the model's texture when working out its colour.
	sampleTexture = true,
	-- How many of a model's vertices to sample for its colour and position.
	sampleVertices = 24,

	-- Only models within this distance of you are looked at.
	scanRadius = 20 * TILE,

	-- A droplet is yours if it's within ownRadius of you sideways (falling on you),
	-- or moving sideways at least minSideSpeed (units per ms) on a path that passes
	-- within ownRadius of you (fired at you).
	ownRadius = 1.5 * TILE,
	minSideSpeed = 0.5,
	-- Height of the point a droplet hits, above your feet.
	hitHeight = 1.5 * TILE,
	-- Speed (units per ms) assumed for a droplet that is hovering, when working out
	-- the order.
	minSpeed = 1,
	-- A droplet that disappears within landRadius of you has hit you.
	landRadius = 2.5 * TILE,

	-- Matching a droplet from one frame to the next: the furthest it can move
	-- between two frames, and how long it can go unseen before it's gone.
	matchDist = 3 * TILE,
	lostMs = 250,
	-- Frames in a row a droplet must look like it isn't coming at you before it's
	-- taken back off the list.
	missFrames = 3,

	-- The attack is over once every droplet has hit and none has appeared for
	-- attackGapMs. Its order stays on screen for holdMs after that.
	attackGapMs = 2000,
	holdMs = 6000,

	-- Learn mode: models up to this many vertices are watched, and one that's gone
	-- within learnBriefMs counts as a brief appearance.
	learnMaxVertices = 4000,
	learnBriefMs = 5000,
	learnReportSize = 12,
}
