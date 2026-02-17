> Based on: https://github.com/mrdoob/three.js/blob/a58e9ecf225b50e4a28a934442e854878bc2a959/examples/webgpu_compute_cloth.html

## What is this?
A module you can use to turn pieces of meshes into cloth-like meshes that will move like cloth... kind of. It has support for colliders (spheres) and grabbing and interacting with the cloth.

>Play with the [online demo](https://bandinopla.github.io/three-simplecloth/)

## How does this work?
You skin your mesh normally but then you vertex paint in red color the parts that you want to turn into "cloth" and then when you use this module you basically pass a reference to the mesh that contains this painting and it will turn it into a "cloth like" mesh, blending between normal skinned and cloth using this color as a mask.

> Read: [Article explaining implementation](https://medium.com/@pablobandinopla/simple-cloth-simulation-with-three-js-and-compute-shaders-on-skeletal-animated-meshes-acb679a70d9f)

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
const cloth = SimpleCloth.onSkinnedMesh( clothing, renderer, { ...config... } );

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
| `magnets` | `number` | [Optional] How many magnets will interact with the cloth (used for grabbing vertices)

# Adding colliders
The code will scan for objects in `collidersRoot` with `userData.stickto="bonename"` OR `userData.clothCollider=true` properties. It will use the scale X and will asume uniform scale, because colliders are spheres. And on every run it will update the position of the colliders so you can move them via code and the cloth will react to them.

# Magnets: Grabbing the cloth
To create the interaction of grabbing and relesing the cloth the system is designed to, when provided a point in world space, find the closest vertex to that point and "grab" it. Then, you call a callback to release it.

```javascript
// activate magnet at index 0
const grabHandler = yourCloth.activateMagnet( 0, pointInTheSceneOrObject3D );

// later at some point in your code, to move it... 
grabHandler.update(); // use this if you originally passed an object3d that you are moving yourself... this method will sync the position.

// If you want to manually pass the values you can call
grabHandler.updatePosition(x,y,z);

//Then when you want to release it so the vertex go back to normal...
grabHandler.deactivate()
```

 
 # Collab / Improve
 Pull requests welcome. If you can improve the math behind the physics, be my guest. I am not a physics expert, I just wanted to have a simple cloth simulation in three.js that I could use in my projects.
