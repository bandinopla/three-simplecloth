> Based on: https://github.com/mrdoob/three.js/blob/a58e9ecf225b50e4a28a934442e854878bc2a959/examples/webgpu_compute_cloth.html

## What is this?
A module you can use to turn pieces of meshes into cloth-like meshes that will move like cloth... kind of.

## How does this work?
You skin your mesh normally but then you vertex paint in red color the parts that you want to turn into "cloth" and then when you use this module you basically pass a reference to the mesh that contains this painting and it will turn it into a "cloth like" mesh, blending between normal skinned and cloth using this color as a mask.

## Install
```bash
npm install three-simplecloth
```

## Usage

```typescript
import { SimpleCloth } from "three-simplecloth";

//
// this will modify the material of the "clothing" Skinned mesh
// and return a handler you must call to update the cloth simulation.
//
const cloth = SimpleCloth.onSkinnedMesh( clothing, renderer );

function animate(delta: number) {
	cloth.update(delta);
}
```

## Config
The third parameter is a config object:

| Property | Type | Description |
| --- | --- | --- |
| `colorAttributeName` | `string` | Usually it is "color" but sometimes it may be other like "color_1". |
| `logStats` | `boolean` | Log stats to the console ( about the cloth mesh ). |
| `collidersRoot` | `Object3D` | The root object to search for colliders. |
| `stiffness` | `number` | Stiffness of the cloth (0.0 to 1.0). |
| `dampening` | `number` | Dampening of the cloth (0.0 to 1.0). |
| `colliderRadiusMultiplier` | `number` | Tweak the radius of the colliders ( which are spheres attached to bones ). Default is 1.0. |
| `windPerSecond` | `Vector3` | Wind DIRECTION in world space (noise will be used to add variation). |
| `gravityPerSecond` | `Vector3` | Gravity force in world space. |
| `updateMaterial` | `function` | A function to override the current skinned mesh material. It receives the material and 2 TSL nodes: vertexNode and normalNode. 
