import assert from "node:assert/strict";
import { World } from "../dist/core/index.js";
import {
	lengthSquaredVec3,
	quat,
	subtractVec3,
	vec3,
} from "../dist/math/index.js";
import {
	type RenderTransform,
	TRANSFORM_COMPONENT,
} from "../dist/modules/rendering/index.js";
import { createMultiplayerSession } from "../dist/multiplayer/index.js";
import { EngineRuntime } from "../dist/runtime/index.js";

// 1. ECS World, math, and EngineRuntime fixed-step tick
{
	const runtime = new EngineRuntime({ fixedDeltaSeconds: 1 / 60 });
	const entity = runtime.world.createEntity();
	const transform: RenderTransform = {
		position: vec3(1, 2, 3),
		rotation: quat(),
		scale: vec3(1, 1, 1),
	};
	runtime.world.addComponent(entity, TRANSFORM_COMPONENT, transform);

	const stored = runtime.world.getComponent<RenderTransform>(
		entity,
		TRANSFORM_COMPONENT,
	);
	assert.ok(stored, "Transform component should be stored on entity");
	assert.equal(
		lengthSquaredVec3(subtractVec3(stored.position, vec3(1, 2, 3))),
		0,
	);

	let ticks = 0;
	runtime.scheduler.registerSystem("gameplay", {
		id: "test-tick",
		update() {
			ticks += 1;
		},
	});
	runtime.start();
	const snap = runtime.update(1 / 60);
	assert.equal(ticks, 1, "EngineRuntime should execute registered systems");
	assert.equal(snap.tick, 1);
	runtime.stop();
}

// 2. Framework-neutral MultiplayerSession contract
{
	const session = createMultiplayerSession({ enabled: true });
	session.markConnecting("host", "sandbox-room");
	const snap = session.snapshot();
	assert.equal(snap.mode, "host");
	assert.equal(snap.roomName, "sandbox-room");
	assert.equal(snap.status, "connecting");
	session.disconnect("done");
	assert.equal(session.snapshot().status, "disconnected");
	assert.equal(session.snapshot().mode, "idle");
}

// 3. Standalone World sanity
{
	const world = new World();
	const e = world.createEntity();
	assert.equal(world.isAlive(e), true);
	assert.equal(world.destroyEntity(e), true);
	assert.equal(world.isAlive(e), false);
}

console.log("@ainekio/engine contract tests passed.");
