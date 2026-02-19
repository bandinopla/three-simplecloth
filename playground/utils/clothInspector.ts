import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { ClothHandler } from "../demo-type";
import { Mesh, MeshBasicMaterial, Object3D, SphereGeometry } from "three";

export function setupClothInspector( cloth:ClothHandler, inspector:Inspector, name="cloth" ) {
//-------------------------- GUI --------------------------
		//#region GUI
		const folder = inspector.createParameters(name);
        folder
            .add(cloth.stiffnessUniform, "value", 0.01, 0.3, 0.01)
            .name("stiffness") 
        folder
            .add(cloth.dampeningUniform, "value", 0.1, .99, 0.01)
            .name("dampening") 
        folder
            .add(cloth.gravityUniform.value, "y", -20, 0, 0.01)
            .name("gravity") 
			;
        folder.add(cloth.windUniform.value, "x", -10.1, 10.1, 0.01).name("wind") 
		folder.add({ debug:false }, "debug").onChange((v)=>{
			cloth?.colliders.forEach((col)=>{
				const o = col.position as Object3D;
				if( v )
				{
					if( o.children.length==0 )
					{
						const s = new Mesh(new SphereGeometry(1), new MeshBasicMaterial({color: 0xff0000, wireframe:true})) 
						o.add( s )
					}
					o.children[0].visible = true;
				}
				else
				{
					if( o.children.length==1)
						o.children[0].visible = false;
				}
			})
		}).name("Show colliders")
		//#endregion
}