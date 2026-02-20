import {
	AnimationMixer,
    AxesHelper,
    Camera,
    DirectionalLight,
    Mesh,
    MeshBasicMaterial,
    MeshPhysicalNodeMaterial,
    Object3D,
    PerspectiveCamera,
    PlaneGeometry,
    Raycaster,
    Scene,
    SkinnedMesh,
    SphereGeometry,
    Vector2,
    Vector3,
    WebGPURenderer,
} from "three/webgpu";
import { DemoApp } from "./demo-type";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import { SimpleCloth } from "../src";
import { color, Fn, positionLocal, uv } from "three/tsl";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { MagnetAPI } from "../src/SimpleCloth";
import { setupClothInspector } from "./utils/clothInspector";
import $mouse from './utils/mouse-events';
import { ndc } from "./utils/ndc";
import { isMobile } from "./utils/isMobile";

export const skirtDemo: DemoApp = (
    renderer: WebGPURenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    controls: OrbitControls,
	inspector:Inspector
) => {	

	// // add a plane as the floor
	// const floor = new Mesh(new PlaneGeometry(4,4));
	// floor.material = new MeshPhysicalNodeMaterial({
	// 	colorNode: color(0,1,0),
	// }) 
	// floor.rotation.x = -Math.PI / 2;
	// floor.castShadow = true;
	// floor.receiveShadow = true;
	// scene.add(floor);

 

	let mixer: AnimationMixer;
	let cloth: ReturnType<typeof SimpleCloth.onSkinnedMesh> | undefined;
	let clicked = false;
	let $mousePosition : MagnetAPI | undefined; 

    new GLTFLoader().load("skirt.glb", (gltf) => {
        scene.add(gltf.scene);
        scene.traverse((o) => {
            if (o instanceof SkinnedMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
				o.frustumCulled = false;
            } else if ( o instanceof PerspectiveCamera) {
                camera.position.copy(o.position);
                camera.quaternion.copy(o.quaternion);
                camera.fov = o.fov;
                camera.updateProjectionMatrix();
   
				controls.target.set(0, isMobile? .8: 0.4, 0);

				controls.update();
            }
        });

		const hitArea = scene.getObjectByName("hitarea")!;
		hitArea.layers.set(1)

		cloth = SimpleCloth.onSkinnedMesh(
			gltf.scene.getObjectByName("her-skirt")! as SkinnedMesh,
			renderer,
			{
				colorAttributeName: "color_1",
				collidersRoot: gltf.scene,
				colliderRadiusMultiplier: 1.1,
				windPerSecond: new Vector3(0.01, 0, 0),
				stiffness: 0.1,
				magnets: 1
			}
		);

		const rig = scene.getObjectByName("rig")! ;
		mixer = new AnimationMixer(rig);
		const clip = gltf.animations[0];
	 
		mixer.clipAction(clip).play()
		.fadeIn(3);

		//-------------------------- GUI --------------------------
		setupClothInspector(cloth, inspector);

		//rig.position.x = .6
		//rig.rotateY(1)

		const $screenPos = new Vector2();
		let clickDistance = 0;
		const updateScreenPos = (ev:{clientX:number, clientY:number}, target?:Vector2 )=>{ 
			return ndc(ev, target ?? $screenPos);
		};

		$mouse.onMouseDown((x,y)=>{ 

			clicked = true; 
  
			updateScreenPos({clientX:x, clientY:y})

			//raycast the scene
			const raycaster = new Raycaster();
			raycaster.setFromCamera($screenPos, camera);
			raycaster.layers.set(1);
			
			const intersects = raycaster.intersectObjects(scene.children);
			 
			if (intersects.length > 0) {
				const intersect = intersects[0];
				const point = intersect.point;  
				 
				$mousePosition = cloth?.activateMagnet(0, point, 1);
				clickDistance = point.distanceTo(camera.position);
				controls.enabled = false;
				 
			}
		});

		$mouse.onMouseUp((x,y)=>{
			$mousePosition?.deactivate();
			$mousePosition = undefined;
			controls.enabled = true;
		});

		$mouse.onMouseMove	((x,y)=>{
	 
			if (clicked && $mousePosition) {
				updateScreenPos({clientX:x, clientY:y}, $screenPos);
				
				// give me a vector3 that is at distance clickDistance from the camera in the direction of the mouse position
				const raycaster = new Raycaster();
				raycaster.setFromCamera($screenPos, camera);
				raycaster.layers.set(1);
				const point = raycaster.ray.at(clickDistance, new Vector3());
				$mousePosition.updatePosition(point.x, point.y, point.z); 
			}
		});

    });

    return (delta: number) => {
	  
			mixer?.update(delta);  
			cloth?.update(delta); 
	};
};
