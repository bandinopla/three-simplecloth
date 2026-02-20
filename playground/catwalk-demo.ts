import { AmbientLight, AnimationMixer, AxesHelper, CubeCamera, DirectionalLight, HemisphereLight, Mesh, MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, Node, Object3D, PerspectiveCamera, PMREMGenerator, Raycaster, Scene, SkinnedMesh, SphereGeometry, Vector3, WebGLCubeRenderTarget, WebGPURenderer } from "three/webgpu";
import { ClothHandler, DemoApp } from "./demo-type";
import { DRACOLoader, GLTFLoader, OrbitControls, RoomEnvironment } from "three/examples/jsm/Addons.js";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { SimpleCloth } from "../src";
import { add, color,normalize, cos, dot, float, mul, mx_noise_float, normalWorld, saturate, select, sheen, sin, time, uniform, uv, vec3, positionViewDirection, Switch, uint } from "three/tsl";
import { ndc } from "./utils/ndc";
import { MagnetHandler } from "../src/SimpleCloth";
import { setupClothInspector } from "./utils/clothInspector";
 
//
export const catwalkDemo: DemoApp = (
    renderer: WebGPURenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    controls: OrbitControls,
    inspector: Inspector,
    cancelDefaultSceneSetup: VoidFunction,
) => {

	cancelDefaultSceneSetup();

	const raycaster = new Raycaster();
			  raycaster.layers.set(1);

	const MAGNETS_COUNT = 10;
	const magnets = Array.from({ length:MAGNETS_COUNT }).map((_m,i)=>new MagnetGizmo(i, camera, raycaster));


	const ambient = new AmbientLight(0xffffff, 0.41);
	scene.add(ambient)

	//
	// light setup
	//
	const dl = new DirectionalLight(0xffffff, 2)
	dl.castShadow = true;
	dl.position.set(4, .4, 0.0539)
	const ssize = 5;
	dl.shadow.camera.left = -ssize;
	dl.shadow.camera.right = ssize;
	dl.shadow.camera.top = ssize;
	dl.shadow.camera.bottom = -ssize;
	dl.shadow.camera.near = 0;
	dl.shadow.camera.far = 5;
	dl.shadow.mapSize.set(2048, 2048);
	dl.shadow.bias = -0.0167; 
	scene.add(dl) 
	scene.add( dl.target )
	dl.target.position.set(0,-1,0)

	const timeForPic = 5;
	const picsDuration = 3;

	let picsTimer = 0;  //5 sec for 3 sec
	function startTakeBunchOfPicturesTimeout(){
		clearTimeout(picsTimer);
		picsTimer = setTimeout(()=>{
			let intensity = dl.intensity;
			let z = dl.position.z;
			let ambientIntensity = ambient.intensity;

			ambient.intensity = 0;

			let flasesIntrvl = setInterval(()=>{
				dl.intensity = Math.random()>0.2?3:0;
				dl.position.z = z + (Math.random()-0.5)*3;
				
			}, 40)

			// random pics....
			setTimeout(()=>{

				clearInterval(flasesIntrvl);
				dl.intensity = intensity;
				dl.position.z = z; 
				ambient.intensity = ambientIntensity;

			}, picsDuration*1000)

		}, timeForPic*1000);
	}

	//
	// debug panel
	//
	// debug panel
	//
	const folder = inspector.createParameters("setting");
	

	let mixer:AnimationMixer|undefined;
	let cloth:ClothHandler|undefined;
	let hair:ClothHandler|undefined; 
	let hitzone:Object3D|undefined;

	let wtf = false;

	//
	// load the scene
	//
	const dracoLoader = new DRACOLoader()
	dracoLoader.setDecoderPath('https://unpkg.com/three@0.182.0/examples/jsm/libs/draco/');

	const loader = new GLTFLoader()
	loader.setDRACOLoader(dracoLoader);
	
	loader.load("catwalk.glb", gltf => {
		scene.add(gltf.scene);

		let shoes:Object3D[]=[]

		scene.traverse((o)=>{
			if(o instanceof Mesh){
				o.castShadow = true;
				o.receiveShadow = true;
			}
			else if (o instanceof PerspectiveCamera){
				camera.position.copy(o.position);
                camera.quaternion.copy(o.quaternion);
                camera.fov = o.fov;
                camera.updateProjectionMatrix(); 
			}

			//
			// grab her shoes
			//
			if(o.name.startsWith("shoe")){
				shoes.push(o);
			}
			else if( o.name=="her-hitzone" )
			{ 
				hitzone = o;
				//hitzone.visible = false;
			}
			
		});  

		const rig = scene.getObjectByName("her-rig")!;
		mixer = new AnimationMixer(rig); 

		// cloth setup
		const dressMesh = rig.getObjectByName("dress")! as SkinnedMesh; 
		cloth = SimpleCloth.onSkinnedMesh(dressMesh, renderer, {
			colorAttributeName:"color_1",
			stiffness:0.2,
			colliderRadiusMultiplier:1.13,
			collidersRoot:rig,
			dampening:0.97,
			magnets:MAGNETS_COUNT
		}); 
		
		setupClothInspector(cloth, inspector, "Dress");

		const hairMesh = rig.getObjectByName("hair-main")! as SkinnedMesh;
		hair = SimpleCloth.onSkinnedMesh(hairMesh, renderer, {
			colorAttributeName:"color_1",
			stiffness:0.02,
			colliderRadiusMultiplier:1.1,
			collidersRoot:rig,
			dampening:0.98, 
			gravityPerSecond:new Vector3(0,-10,0)
		});

		const hairMaterial = hairMesh.material as MeshPhysicalNodeMaterial;
		hairMaterial.colorNode = color("white"); 
		hairMaterial.transparent = false;
 
		if(hitzone){
			hitzone.layers.set(1);
			scene.getObjectByName( hitzone.userData.stickto.replace(":","") )?.attach(hitzone)
		}
 

		mixer.addEventListener("loop", ()=>{
			startTakeBunchOfPicturesTimeout()
		}) 

		//
		// dress material...
		// 
		const noise = mx_noise_float(uv().mul(399));
		const dressMaterial = dressMesh.material as MeshPhysicalNodeMaterial;

		// night out
		const sheenMask = dot( normalWorld.normalize().dot(positionViewDirection.normalize()), normalize( positionViewDirection ) );
		const colorByType = [
			{
				name:"Night Out",
				colorNode: color("#222").mul(0.7),
				metalnessNode: float(0.8).add(noise.mul(.6)),
				roughnessNode: float(0.5).sub(noise.mul(.6)),
				opacityNode: float(1)
			},
			{
				name:"Premiere",
				colorNode: color("red").mul(2) ,
				metalnessNode: float(.8) ,
				roughnessNode: float(0.2), 
				opacityNode: float(1)
			},
			{
				name:"Plastic Love",
				colorNode: color("pink").mul(2.2).add( sheenMask.mul(0.5) .mul(color("hotpink").mul(2.2)) ) ,
				metalnessNode: float(.2) ,
				roughnessNode: float(0.12), 
				opacityNode: float(sheenMask.clamp(0,1) ).add(0.2)
			},
			{
				name:"Unicorn",
				colorNode: color("white").mul(2),
				metalnessNode: float(0),
				roughnessNode: float(1),
				opacityNode: float(1)
			}
		]; 
 
		const setMaterial = (index:number)=>{
			const nodes = colorByType[index];
			dressMaterial.colorNode = nodes.colorNode;
			dressMaterial.metalnessNode = nodes.metalnessNode;
			dressMaterial.roughnessNode = nodes.roughnessNode;
			dressMaterial.opacityNode = nodes.opacityNode;
			dressMaterial.transparent = true;
			dressMesh.material.needsUpdate = true;
		}

		folder.add({ o:0 },"o", colorByType.reduce((acc, v, i) => ({ ...acc, [v.name]: i }), {}) ).name("Dress Color").onChange((v)=>{
			
			setMaterial(v)
		})
 
		setMaterial(0)

		const animation = mixer.clipAction(gltf.animations[0])
		 

		//
		// in this example I positioned the shoes while the skeleton was on pose mode, so i need to send the mesh to that frame.
		//
		animation.play() 
		mixer.update(0);
 
		//
		// stick shows to feet
		//
		shoes.forEach(shoe=>{
			const target = scene.getObjectByName( shoe.userData.stickto.replace(":","") )!
			target.attach(shoe);
		}); 

		//
		// from default pose to action, leave some time for the cloth to settle.
		//
		animation.fadeIn(2);
		startTakeBunchOfPicturesTimeout()
 

		//
		// bg 
		//
		const bg = scene.getObjectByName("bg") as Mesh; 
 
		bg.material = new MeshPhysicalNodeMaterial({
			colorNode: color("red").mul(0.5).mul( uv().y.pow(2) ) .mul(mx_noise_float(uv().add(time).mul(1555)).mul(1.2).add(0.5)),//.mul(   ),
			roughness:0.82
		})

		//
		// fg 
		//
		const fg = scene.getObjectByName("fg") as Mesh; 
 
		fg.material = new MeshPhysicalNodeMaterial({
			colorNode: uv().y.pow(1.2).sub(0.3),//.mul( mx_noise_float(uv().mul(1299)).mul(0.2)  ),
			roughness:0.12
		});

		//
		// handle interaction...
		//
		

		renderer.domElement.addEventListener("pointerdown", (ev)=>{
			const screenPos = ndc(ev);	
			
			raycaster.setFromCamera(screenPos, camera);
			const hit = raycaster.intersectObject(scene)
			if(hit.length>0){

				if( hit[0].object instanceof MagnetGizmo )
				{
					hit[0].object.resume()
					return;
				}

				const ax = magnets.find( m=>m.isFree )!;
				ax.position.copy(hit[0].point);
				scene.add(ax);
				
				// set as magnet
				ax.startHandling(cloth!.activateMagnet( ax.index, ax )); 
			}
			console.log("POINTER DOWN", hit)
		})
	})

	let t = 0;
    return (delta: number) => {
		if( wtf) return;
		mixer?.update(delta);
		cloth?.update(delta);
		hair?.update(delta);
		t += delta;
		camera.position.y += Math.cos(t) * 0.0003
	};
};


/**
 * The material of every gizmo used to visualize the sticky points used to manipulate the cloth.
 */
const handlerMaterial = new MeshPhysicalNodeMaterial({
	colorNode: vec3(uv(),1),
	metalness:0.5,
	roughness:0.3
});

/**
 * This class handles the sphere icon that is used to manipulate the cloth.
 */
class MagnetGizmo extends Mesh 
{
	private handler:MagnetHandler|undefined;
	private active = false;
	private distance = 0;
	private moved = false;

	constructor( readonly index:number, private camera:PerspectiveCamera, private raycaster:Raycaster ) {
		const geometry = new SphereGeometry(0.041, 16, 16); 
		super(geometry, handlerMaterial);

		this.layers.enable(1);

		window.addEventListener("mousemove", ev=>{
			if( this.active )
			{
				this.moved = true;

				const screenPos = ndc(ev);

				raycaster.setFromCamera(screenPos, camera);

				const point = raycaster.ray.origin
					  .clone()
					  .add(raycaster.ray.direction.clone().multiplyScalar(this.distance));

				this.position.copy(point);
				this.lookAt(this.camera.position);
				this.handler?.update()
			}
		});

		window.addEventListener("mouseup",ev=>{
			this.active = false; 
			if( !this.moved )
			{
				this.stop();
			}
		})
	}

	get isFree() {
		return this.handler === undefined;
	}

	private calculateDistance() { 
		this.distance = this.position.distanceTo(this.camera.position);
	}

	startHandling( handler:MagnetHandler ){
		if( this.handler ){
			this.handler.deactivate();
		}

		this.handler = handler; 
		handler.update();

		// we assume we are under a pointer down event...
		this.active = true;
		this.moved = false;
		this.visible = true;
		this.calculateDistance();
	}

	resume() { 
		this.active = true;
		this.moved = false;
	}

	stop() {
		this.handler?.deactivate();
		this.handler = undefined;
		this.active = false;
		this.moved = false; 
		this.visible = false;
	}
}