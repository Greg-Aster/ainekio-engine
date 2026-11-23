/**
 * Minimal headless sandbox demonstrating @ainekio/engine's framework-neutral
 * ECS World, math, rendering components, and fixed-step EngineRuntime.
 *
 * Run from the repo root after building:
 *   pnpm exec tsx examples/sandbox/main.ts
 */
import {
	EngineRuntime,
	type RenderTransform,
	TRANSFORM_COMPONENT,
	quat,
	vec3,
} from "../../dist/index.js";

const runtime = new EngineRuntime({ fixedDeltaSeconds: 1 / 60 });
const box = runtime.world.createEntity();

runtime.world.addComponent<RenderTransform>(box, TRANSFORM_COMPONENT, {
	position: vec3(0, 1, 0),
	rotation: quat(),
	scale: vec3(1, 1, 1),
});

runtime.scheduler.registerSystem("gameplay", {
	id: "bob-box",
	update(ctx) {
		const transform = ctx.world.getComponent<RenderTransform>(
			box,
			TRANSFORM_COMPONENT,
		);
		if (transform) {
			transform.position.y =
				1 + Math.sin(ctx.tick * ctx.deltaSeconds * 2) * 0.25;
		}
	},
});

runtime.start();
for (let i = 0; i < 60; i += 1) {
	runtime.update(1 / 60);
}
const finalTransform = runtime.world.getComponent<RenderTransform>(
	box,
	TRANSFORM_COMPONENT,
);
console.log(
	`Sandbox stepped ${runtime.snapshot().tick} ticks; box.y = ${finalTransform?.position.y.toFixed(4)}`,
);
runtime.stop();
