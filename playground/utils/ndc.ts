import { Vector2 } from "three";

export const ndc = (ev:MouseEvent, target = new Vector2() )=>{  
					target.x = (ev.clientX / window.innerWidth) * 2 - 1;
					target.y = -(ev.clientY / window.innerHeight) * 2 + 1;
					return target;
		};