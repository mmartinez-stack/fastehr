import { patientClinicalInput } from "@fastehr/contracts"
import { describe, expect, it } from "vitest"
import { splitHeight } from "./height.ts"

describe("height round trip", () => {
  it("shows a stored 64 as 5 ft 4 in", () => {
    expect(splitHeight(64)).toEqual({ heightFeet: "5", heightInchesPart: "4" })
    expect(splitHeight(74)).toEqual({ heightFeet: "6", heightInchesPart: "2" })
    expect(splitHeight(64.5)).toEqual({ heightFeet: "5", heightInchesPart: "4.5" })
    expect(splitHeight(null)).toEqual({ heightFeet: "", heightInchesPart: "" })
  })

  it("enter 5 ft 4 in, store 64, display 5 ft 4 in", () => {
    // The form's two fields → the contract's total → the form's two fields.
    const stored = patientClinicalInput.parse({
      heightFeet: "5",
      heightInchesPart: "4",
      medications: [],
      pcpName: "",
      pcpAddress: "",
      pcpPhone: "",
    }).heightInches
    expect(stored).toBe(64)
    expect(splitHeight(stored)).toEqual({ heightFeet: "5", heightInchesPart: "4" })
  })
})
