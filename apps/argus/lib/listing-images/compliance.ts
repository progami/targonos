export type ListingImageSlotMetrics = {
  position: number;
  byteSize: number;
  width: number;
  height: number;
};

export type ListingImageComplianceResult = {
  setErrors: string[];
  setWarnings: string[];
  slots: Array<{ position: number; errors: string[]; warnings: string[] }>;
};

const MAX_SLOTS = 9;
const WARN_BYTES = 10 * 1024 * 1024;
const MAX_BYTES = 15 * 1024 * 1024;
const RECOMMENDED_MIN_SIDE = 1000;

export function evaluateListingImageCompliance(slots: ListingImageSlotMetrics[]): ListingImageComplianceResult {
  const setErrors: string[] = [];
  const setWarnings: string[] = [];

  if (slots.length === 0) {
    setErrors.push('Add at least 1 image.');
  }
  if (slots.length > MAX_SLOTS) {
    setErrors.push(`Max ${MAX_SLOTS} images per version.`);
  }

  const perSlot = slots
    .map((s) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      if (s.byteSize > MAX_BYTES) {
        errors.push('File exceeds 15MB (blocked).');
      } else if (s.byteSize > WARN_BYTES) {
        warnings.push('File is over 10MB (warning).');
      }

      const minSide = Math.min(s.width, s.height);
      if (minSide < RECOMMENDED_MIN_SIDE) {
        warnings.push('Recommended minimum 1000px on the shortest side.');
      }

      if (s.position === 1 && s.width !== s.height) {
        warnings.push('Main image should be square.');
      }

      return { position: s.position, errors, warnings };
    })
    .sort((a, b) => a.position - b.position);

  return {
    setErrors,
    setWarnings,
    slots: perSlot,
  };
}

