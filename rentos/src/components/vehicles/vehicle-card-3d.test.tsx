// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Next renders client components on the server too. model-viewer touches the
// browser-only `self` global when imported, which crashed the Fleet page in
// production. The node environment (no `self`) reproduces that.
describe("VehicleCard3D", () => {
  it("renders on the server without browser globals", async () => {
    const { VehicleCard3D } = await import("./vehicle-card-3d");
    const html = renderToString(<VehicleCard3D modelGlbKey="sedan.glb" color="Silver" />);
    expect(html).toContain("<model-viewer");
    expect(html).toContain('src="/models/sedan.glb"');
  });
});
