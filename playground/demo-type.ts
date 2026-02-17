import { OrbitControls } from "three/examples/jsm/Addons.js";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { Camera, PerspectiveCamera, Scene, WebGPURenderer } from "three/webgpu";

export type DemoApp = ( renderer:WebGPURenderer, scene:Scene, camera:PerspectiveCamera, controls:OrbitControls, inspector:Inspector ) => ( delta:number ) => void