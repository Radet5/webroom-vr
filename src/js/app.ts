import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { RoomManager } from './components/room-manager/room-manager';

const container = document.createElement( 'div' );
document.body.appendChild( container );

const roomManager = new RoomManager(container, window.innerWidth, window.innerHeight);
const renderer = roomManager.getRenderer();
roomManager.init();

container.appendChild(renderer.domElement);
document.body.appendChild( VRButton.createButton( renderer ) );

window.addEventListener( 'resize', roomManager.onWindowResize );

roomManager.animate();
