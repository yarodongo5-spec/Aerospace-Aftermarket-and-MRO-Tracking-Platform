import { describe, it, expect, beforeEach } from "vitest";

// Define types for component and provenance data
interface Component {
  serialNumber: string;
  partNumber: string;
  manufacturer: string;
  owner: string;
  metadata: string;
  status: string;
  createdAt: bigint;
  lastUpdated: bigint;
}

interface ProvenanceEvent {
  eventType: string;
  initiator: string;
  timestamp: bigint;
  details: string;
}

// Mock contract state
interface MockContract {
  admin: string;
  paused: boolean;
  componentCounter: bigint;
  components: Map<string, Component>;
  provenance: Map<string, ProvenanceEvent>;
  eventCounters: Map<string, bigint>;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  registerComponent(
    caller: string,
    serialNumber: string,
    partNumber: string,
    manufacturer: string,
    metadata: string
  ): { value: bigint } | { error: number };
  transferOwnership(caller: string, componentId: bigint, newOwner: string): { value: boolean } | { error: number };
  updateMetadata(caller: string, componentId: bigint, metadata: string): { value: boolean } | { error: number };
  updateStatus(caller: string, componentId: bigint, status: string): { value: boolean } | { error: number };
  getComponent(componentId: bigint): { value: Component } | { error: number };
  getProvenance(componentId: bigint, eventId: bigint): { value: ProvenanceEvent } | { error: number };
  getEventCounter(componentId: bigint): { value: bigint };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  componentCounter: 0n,
  components: new Map<string, Component>(),
  provenance: new Map<string, ProvenanceEvent>(),
  eventCounters: new Map<string, bigint>(),

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  registerComponent(caller: string, serialNumber: string, partNumber: string, manufacturer: string, metadata: string) {
    if (this.paused) return { error: 103 };
    if (!this.isAdmin(caller)) return { error: 100 };
    if (metadata.length === 0 || metadata.length > 256) return { error: 105 };
    const componentId = this.componentCounter + 1n;
    const key = componentId.toString();
    if (this.components.has(key)) return { error: 101 };
    this.components.set(key, {
      serialNumber,
      partNumber,
      manufacturer,
      owner: caller,
      metadata,
      status: "active",
      createdAt: BigInt(1000),
      lastUpdated: BigInt(1000),
    });
    this.eventCounters.set(key, 1n);
    this.provenance.set(`${key}-1`, {
      eventType: "registered",
      initiator: caller,
      timestamp: BigInt(1000),
      details: `{"serial":"${serialNumber}","part":"${partNumber}"}`,
    });
    this.componentCounter = componentId;
    return { value: componentId };
  },

  transferOwnership(caller: string, componentId: bigint, newOwner: string) {
    if (this.paused) return { error: 103 };
    if (newOwner === "SP000000000000000000002Q6VF78") return { error: 104 };
    const key = componentId.toString();
    const component = this.components.get(key);
    if (!component) return { error: 102 };
    if (caller !== component.owner) return { error: 106 };
    this.components.set(key, { ...component, owner: newOwner, lastUpdated: BigInt(1001) });
    const eventId = (this.eventCounters.get(key) || 0n) + 1n;
    this.eventCounters.set(key, eventId);
    this.provenance.set(`${key}-${eventId}`, {
      eventType: "transferred",
      initiator: caller,
      timestamp: BigInt(1001),
      details: `{"new-owner":"${newOwner}"}`,
    });
    return { value: true };
  },

  updateMetadata(caller: string, componentId: bigint, metadata: string) {
    if (this.paused) return { error: 103 };
    if (metadata.length === 0 || metadata.length > 256) return { error: 105 };
    const key = componentId.toString();
    const component = this.components.get(key);
    if (!component) return { error: 102 };
    if (caller !== this.admin && caller !== component.owner) return { error: 100 };
    this.components.set(key, { ...component, metadata, lastUpdated: BigInt(1001) });
    const eventId = (this.eventCounters.get(key) || 0n) + 1n;
    this.eventCounters.set(key, eventId);
    this.provenance.set(`${key}-${eventId}`, {
      eventType: "metadata-updated",
      initiator: caller,
      timestamp: BigInt(1001),
      details: metadata,
    });
    return { value: true };
  },

  updateStatus(caller: string, componentId: bigint, status: string) {
    if (this.paused) return { error: 103 };
    if (!this.isAdmin(caller)) return { error: 100 };
    const key = componentId.toString();
    const component = this.components.get(key);
    if (!component) return { error: 102 };
    this.components.set(key, { ...component, status, lastUpdated: BigInt(1001) });
    const eventId = (this.eventCounters.get(key) || 0n) + 1n;
    this.eventCounters.set(key, eventId);
    this.provenance.set(`${key}-${eventId}`, {
      eventType: "status-updated",
      initiator: caller,
      timestamp: BigInt(1001),
      details: `{"status":"${status}"}`,
    });
    return { value: true };
  },

  getComponent(componentId: bigint) {
    const component = this.components.get(componentId.toString());
    if (!component) return { error: 102 };
    return { value: component };
  },

  getProvenance(componentId: bigint, eventId: bigint) {
    const event = this.provenance.get(`${componentId}-${eventId}`);
    if (!event) return { error: 102 };
    return { value: event };
  },

  getEventCounter(componentId: bigint) {
    return { value: this.eventCounters.get(componentId.toString()) || 0n };
  },
};

describe("Component Registry Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.componentCounter = 0n;
    mockContract.components = new Map();
    mockContract.provenance = new Map();
    mockContract.eventCounters = new Map();
  });

  it("should register a new component by admin", () => {
    const result = mockContract.registerComponent(
      mockContract.admin,
      "SN12345",
      "PN67890",
      "ST2CY5...",
      '{"spec":"turbine-blade"}'
    );
    expect(result).toEqual({ value: 1n });
    expect(mockContract.components.get("1")).toEqual({
      serialNumber: "SN12345",
      partNumber: "PN67890",
      manufacturer: "ST2CY5...",
      owner: mockContract.admin,
      metadata: '{"spec":"turbine-blade"}',
      status: "active",
      createdAt: 1000n,
      lastUpdated: 1000n,
    });
    expect(mockContract.provenance.get("1-1")).toEqual({
      eventType: "registered",
      initiator: mockContract.admin,
      timestamp: 1000n,
      details: '{"serial":"SN12345","part":"PN67890"}',
    });
  });

  it("should prevent non-admin from registering", () => {
    const result = mockContract.registerComponent(
      "ST2CY5...",
      "SN12345",
      "PN67890",
      "ST2CY5...",
      '{"spec":"turbine-blade"}'
    );
    expect(result).toEqual({ error: 100 });
  });

  it("should prevent registering with invalid metadata", () => {
    const result = mockContract.registerComponent(mockContract.admin, "SN12345", "PN67890", "ST2CY5...", "");
    expect(result).toEqual({ error: 105 });
  });

  it("should transfer ownership by current owner", () => {
    mockContract.registerComponent(mockContract.admin, "SN12345", "PN67890", "ST2CY5...", '{"spec":"turbine-blade"}');
    const result = mockContract.transferOwnership(mockContract.admin, 1n, "ST3NB...");
    expect(result).toEqual({ value: true });
    expect(mockContract.components.get("1")?.owner).toBe("ST3NB...");
    expect(mockContract.provenance.get("1-2")?.eventType).toBe("transferred");
  });

  it("should prevent non-owner from transferring", () => {
    mockContract.registerComponent(mockContract.admin, "SN12345", "PN67890", "ST2CY5...", '{"spec":"turbine-blade"}');
    const result = mockContract.transferOwnership("ST2CY5...", 1n, "ST3NB...");
    expect(result).toEqual({ error: 106 });
  });

  it("should update metadata by owner or admin", () => {
    mockContract.registerComponent(mockContract.admin, "SN12345", "PN67890", "ST2CY5...", '{"spec":"turbine-blade"}');
    const result = mockContract.updateMetadata(mockContract.admin, 1n, '{"spec":"updated-blade"}');
    expect(result).toEqual({ value: true });
    expect(mockContract.components.get("1")?.metadata).toBe('{"spec":"updated-blade"}');
    expect(mockContract.provenance.get("1-2")?.eventType).toBe("metadata-updated");
  });

  it("should update status by admin", () => {
    mockContract.registerComponent(mockContract.admin, "SN12345", "PN67890", "ST2CY5...", '{"spec":"turbine-blade"}');
    const result = mockContract.updateStatus(mockContract.admin, 1n, "under-repair");
    expect(result).toEqual({ value: true });
    expect(mockContract.components.get("1")?.status).toBe("under-repair");
    expect(mockContract.provenance.get("1-2")?.eventType).toBe("status-updated");
  });

  it("should prevent non-admin from updating status", () => {
    mockContract.registerComponent(mockContract.admin, "SN12345", "PN67890", "ST2CY5...", '{"spec":"turbine-blade"}');
    const result = mockContract.updateStatus("ST2CY5...", 1n, "under-repair");
    expect(result).toEqual({ error: 100 });
  });

  it("should not allow actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.registerComponent(
      mockContract.admin,
      "SN12345",
      "PN67890",
      "ST2CY5...",
      '{"spec":"turbine-blade"}'
    );
    expect(result).toEqual({ error: 103 });
  });

  it("should retrieve component details", () => {
    mockContract.registerComponent(mockContract.admin, "SN12345", "PN67890", "ST2CY5...", '{"spec":"turbine-blade"}');
    const result = mockContract.getComponent(1n);
    expect(result).toEqual({
      value: {
        serialNumber: "SN12345",
        partNumber: "PN67890",
        manufacturer: "ST2CY5...",
        owner: mockContract.admin,
        metadata: '{"spec":"turbine-blade"}',
        status: "active",
        createdAt: 1000n,
        lastUpdated: 1000n,
      },
    });
  });

  it("should retrieve provenance event", () => {
    mockContract.registerComponent(mockContract.admin, "SN12345", "PN67890", "ST2CY5...", '{"spec":"turbine-blade"}');
    const result = mockContract.getProvenance(1n, 1n);
    expect(result).toEqual({
      value: {
        eventType: "registered",
        initiator: mockContract.admin,
        timestamp: 1000n,
        details: '{"serial":"SN12345","part":"PN67890"}',
      },
    });
  });
});