import { io, Socket } from "socket.io-client";
import Peer from "simple-peer";
import { Buffer } from "buffer";
import "dotenv/config";
import type { PlayerData } from "../agent/other-player";
import type { GrabObjectInterface } from "../user/vr-user";
import type { releaseObjectInterface } from "../user/vr-user";
import SimplePeer from "simple-peer";

const ENV = process.env.NODE_ENV || "development";

interface PeerData {
  peerID: string;
  peer: SimplePeer.Instance;
  connected: boolean;
}

export class ServerDataManager {
  #serverURL;
  #socket: Socket;
  #peers: Array<PeerData>;
  #newUserCallback: (userID: string) => void;
  #removeUserCallback: (userID: string) => void;
  #updatePlayerCallback: (userId: string, playerData: PlayerData) => void;
  #grabObjectCallback: (
    userID: string,
    grabObjectData: GrabObjectInterface
  ) => void;
  #releaseObjectCallback: (
    userId: string,
    releaseObjectData: releaseObjectInterface
  ) => void;
  constructor() {
    if (ENV === "production") {
      this.#serverURL = "https://api.radet5.com:8000";
    } else {
      this.#serverURL = "http://localhost:8000";
    }
    this.#peers = [];
  }

  getPeerCount() {
    return this.#peers.length;
  }

  sendToAll(data: any) {
    this.#peers.forEach((peer: PeerData) => {
      if (peer && peer.connected) {
        peer.peer.send(JSON.stringify({ userID: this.#socket.id, data }));
      }
    });
  }

  registerNewUserCallback(callback: (userID: string) => void) {
    this.#newUserCallback = callback;
  }

  registerRemoveUserCallback(callback: (userID: string) => void) {
    this.#removeUserCallback = callback;
  }

  registerUpdatePlayerCallback(
    callback: (userID: string, playerData: PlayerData) => void
  ) {
    this.#updatePlayerCallback = callback;
  }

  registerGrabObjectCallback(
    callback: (userID: string, grabObjectData: GrabObjectInterface) => void
  ) {
    this.#grabObjectCallback = callback;
  }

  registerReleaseObjectCallback(
    callback: (
      userID: string,
      releaseObjectData: releaseObjectInterface
    ) => void
  ) {
    this.#releaseObjectCallback = callback;
  }

  start() {
    this.#socket = io(this.#serverURL, {
      secure: true,
      rejectUnauthorized: false,
    });
    this.#socket.emit("join room");
    this.#socket.on("all users", (users: Array<string>) => {
      //console.log(users);
      users.forEach((peerID: string) => {
        const peer = this.#createPeer(peerID, this.#socket.id);
        this.#peers.push({ peerID, peer, connected: false });
      });
    });

    this.#socket.on(
      "user joined",
      (payload: { signal: SimplePeer.SignalData; callerID: string }) => {
        const peer = this.#addPeer(payload.signal, payload.callerID);
        this.#peers.push({ peerID: payload.callerID, peer, connected: false });
      }
    );

    this.#socket.on(
      "receiving returned signal",
      (payload: { signal: SimplePeer.SignalData; id: string }) => {
        const peerData = this.#peers.find(
          (peer: PeerData) => peer.peerID === payload.id
        );
        if (peerData) {
          peerData.peer.signal(payload.signal);
        }
      }
    );

    this.#socket.on("user left", (id: string) => {
      const peerData = this.#peers.find((peer: PeerData) => peer.peerID === id);
      if (peerData) {
        console.log("DISCONNECTED", id);
        peerData.peer.destroy();
        if (typeof this.#removeUserCallback === "function") {
          this.#removeUserCallback(id);
        }
      }
      this.#peers = this.#peers.filter((item: PeerData) => item.peerID !== id);
    });
  }

  #parseData(data: any) {
    const parsedData = JSON.parse(Buffer.from(data).toString());
    //console.log(parsedData);
    Object.keys(parsedData.data).forEach((key: string) => {
      if (key === "playerData") {
        if (typeof this.#updatePlayerCallback === "function") {
          this.#updatePlayerCallback(parsedData.userID, parsedData.data[key]);
        }
      } else if (key === "grabObject") {
        //console.log(
        //  parsedData.userID,
        //  "grabObject",
        //  parsedData.data.grabObject
        //);
        this.#grabObjectCallback(parsedData.userID, parsedData.data.grabObject);
      } else if (key === "releaseObject") {
        //console.log(
        //  parsedData.userID,
        //  "releaseObject",
        //  parsedData.data.releaseObject
        //);
        this.#releaseObjectCallback(
          parsedData.userID,
          parsedData.data.releaseObject
        );
      }
    });
  }

  #onConnect(userID: string) {
    console.log("CONNECTED", userID);
    this.#peers.forEach((peer: PeerData) => {
      if (peer.peerID === userID) {
        peer.connected = true;
      }
    });
    if (typeof this.#newUserCallback === "function") {
      this.#newUserCallback(userID);
    }
  }

  #createPeer(userToSignal: string, callerID: string) {
    const peer = new Peer({
      initiator: true,
      trickle: false,
    });

    peer.on("signal", (signal) => {
      this.#socket.emit("sending signal", { userToSignal, callerID, signal });
    });

    peer.on("connect", () => this.#onConnect(userToSignal));

    //peer.on("data", (data:any) => console.log(data));
    peer.on("data", (data:any) => this.#parseData(data));

    return peer;
  }

  #addPeer(incomingSignal: SimplePeer.SignalData, callerID: string) {
    const peer = new Peer({
      initiator: false,
      trickle: false,
    });

    peer.on("signal", (signal) => {
      this.#socket.emit("returning signal", { signal, callerID });
    });

    peer.on("connect", () => this.#onConnect(callerID));

    //peer.on("data", handleReceivingData);
    peer.on("data", (data: any) => this.#parseData(data));

    peer.signal(incomingSignal);
    return peer;
  }
}
