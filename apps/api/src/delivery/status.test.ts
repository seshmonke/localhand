import { describe, expect, it } from "vitest";
import { mapDeliveryStatus } from "./status.js";

describe("mapDeliveryStatus", () => {
  it("maps terminal and intermediate CDEK codes", () => {
    expect(mapDeliveryStatus("DELIVERED")).toBe("delivered");
    expect(mapDeliveryStatus("NOT_DELIVERED")).toBe("canceled");
    expect(mapDeliveryStatus("RETURNED")).toBe("canceled");
    expect(mapDeliveryStatus("CREATED")).toBe("created");
    expect(mapDeliveryStatus("ACCEPTED")).toBe("created");
    expect(mapDeliveryStatus("RECEIVED_AT_SHIPMENT_WAREHOUSE")).toBe("created");
    expect(mapDeliveryStatus("IN_TRANSIT")).toBe("in_transit");
  });

  it("keeps unknown codes as in_transit and normalizes case", () => {
    expect(mapDeliveryStatus("unknown_new_code")).toBe("in_transit");
    expect(mapDeliveryStatus(" delivered ")).toBe("delivered");
  });
});
