import { AnimationMixer, AxesHelper, Mesh, MeshBasicNodeMaterial, Object3D, PerspectiveCamera, Ray, Raycaster, Scene, SkinnedMesh, SphereGeometry, Vector2, Vector3, WebGPURenderer } from "three/webgpu";
import { ClothHandler, DemoApp } from "./demo-type";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { SimpleCloth } from "../src";
import { MagnetAPI } from "../src/SimpleCloth";
import { uv, vec3 } from "three/tsl";
import { setupClothInspector } from "./utils/clothInspector";
import { ndc } from "./utils/ndc";





//
export const dudeMultigrabDemo: DemoApp = (
    renderer: WebGPURenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    controls: OrbitControls,
	inspector:Inspector
) => {	

	const MAGNETS_COUNT = 3;
	let magnets:MagnetHandler[] = [];
	let mixer:AnimationMixer|undefined;
	let shirt: ClothHandler | undefined;
	let isDragging = false;
	let pants: ClothHandler | undefined; 
	const raycaster = new Raycaster();
	raycaster.layers.set(1);

	let hitAreas : { shirt:Object3D|undefined, pants:Object3D|undefined } = { shirt:undefined, pants:undefined };

	const handleGrabOn = ( hitArea:Object3D, cloth:ClothHandler, ev:MouseEvent )=>{

		const intersects = raycaster.intersectObjects([hitArea, ...magnets.map(m=>m.icon)]);
		if (intersects.length > 0) {
			const intersect = intersects[0]; 
			const point = intersect.point; 

			controls.enabled = false;
			isDragging = true;

			if( intersect.object.userData.onMouseDown )
			{
				intersect.object.userData.onMouseDown( ev ) 
				return;
			}
				

			const handler = magnets.length>=MAGNETS_COUNT ? magnets.shift()! : new MagnetHandler(magnets.length, scene, camera, raycaster);
			magnets.push(handler);

			hitArea.attach( handler.track(cloth, point) )
		}
	}

	new GLTFLoader().load("dude.glb", file => {
		scene.add(file.scene)
		scene.traverse((o) => {
			if (o instanceof SkinnedMesh) {
				o.castShadow = true;
				o.receiveShadow = true;
				console.log( o.name )
			} else if ( o instanceof PerspectiveCamera) {
				camera.position.copy(o.position);
				camera.quaternion.copy(o.quaternion);
				camera.fov = o.fov;
				camera.updateProjectionMatrix();
   
				controls.target.set(0, 1.1, 0);

				controls.update();
			}

			if( o.userData.collider )
			{
				hitAreas[ o.userData.collider as "shirt" | "pants" ] = o;
				o.layers.set(1)
			}
		}); 

		const rig = scene.getObjectByName("rig-guy")!;
		mixer = new AnimationMixer(rig);
		mixer.clipAction(file.animations[0]).play() ;

		shirt = SimpleCloth.onSkinnedMesh(
			rig.getObjectByName("shirt")! as SkinnedMesh,
			renderer,
			{
				colorAttributeName: "color_1",
				collidersRoot: rig,
				colliderRadiusMultiplier: 1,
				windPerSecond: new Vector3(0.01, 0, 0),
				stiffness: 0.07,
				magnets: MAGNETS_COUNT
			}
		);

		setupClothInspector(shirt, inspector);

		// pants = SimpleCloth.onSkinnedMesh(
		// 	rig.getObjectByName("pants")! as SkinnedMesh,
		// 	renderer,
		// 	{
		// 		colorAttributeName: "color_1",
		// 		collidersRoot: rig,
		// 		colliderRadiusMultiplier: 1, 
		// 		stiffness: .5,
		// 		magnets: MAGNETS_COUNT
		// 	}
		// );

		//
		// stick colliders to bones
		//
		[hitAreas.shirt/*,hitAreas.pants*/].forEach((o)=>{
		  
			const bone = scene.getObjectByName( o!.userData.stickto.replaceAll(".","") );
			 
			if( bone )
				bone.attach(o!) 
		}) 

		renderer.domElement.addEventListener("mousedown", ev => {
			if( ev.button !== 0 ) return;

			const screenPos = ndc(ev);
			raycaster.setFromCamera(screenPos, camera);
 

			handleGrabOn( hitAreas.shirt!, shirt!, ev ); 
			//handleGrabOn( hitAreas.pants!, pants!, ev ); 
		});

		renderer.domElement.addEventListener("mouseup", ev => {
			isDragging = false;
			controls.enabled = true;
		})
 
	})

	return ( delta:number )=> {
		mixer?.update(delta)
		shirt?.update(delta)
		pants?.update(delta)
	}
}

const handlerIconMaterial = new MeshBasicNodeMaterial({
	colorNode:vec3(uv(),1), 
})

class MagnetHandler { 
	control:MagnetAPI|undefined;
	private reset:VoidFunction|undefined;
	readonly icon:Object3D;
	private isDragging = false;
	private distance = 0;
	private moved = false;

	constructor(readonly index:number, readonly scene:Scene, readonly camera:PerspectiveCamera, readonly raycaster:Raycaster){

		this.icon = new Mesh(new SphereGeometry(0.03), handlerIconMaterial);
		this.icon.layers.enable(1)
		this.icon.userData.isHandler = true;
		this.icon.castShadow = true;

		this.icon.onBeforeRender = ()=>{
			this.control?.update()
		}

		window.addEventListener("mousemove", ev => {
			if( !this.isDragging ) return;

			this.moved = true;

			const screenPos = ndc(ev);
			raycaster.setFromCamera(screenPos, camera);
			
			const point = raycaster.ray.origin
				  .clone()
				  .add(raycaster.ray.direction.clone().multiplyScalar(this.distance));

			this.control?.updatePosition(point.x, point.y, point.z)

			this.icon.position.copy(point);
			this.icon.parent?.worldToLocal(this.icon.position) 
		})

		window.addEventListener("mouseup", ev => {
			this.isDragging = false;
			if( !this.moved )
			{
				this.reset?.();
			}
		})
	}

	track(cloth:ClothHandler, worldPos:Vector3){
		this.reset?.();
 
		
		this.icon.position.copy(worldPos);
		this.scene.add(this.icon);

		this.control = cloth.activateMagnet(this.index , this.icon, 1); 

		this.isDragging = true;
		this.distance = worldPos.distanceTo(this.camera.position) ;

		this.icon.userData.onMouseDown = ( ev:MouseEvent ) => {

			this.isDragging = true;
			this.moved = false;
			this.distance = this.icon.position.distanceTo(this.camera.position) ;
		}
 

		this.reset = () => {
			this.control?.deactivate();
			this.control = undefined;
			this.scene.remove(this.icon);
			this.isDragging = false;
			this.moved = false;
			this.icon.removeFromParent();
		}

		return this.icon;
	}
}