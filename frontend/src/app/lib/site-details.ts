export const siteDetails = {
  name: "StackWing",
  origin: "https://stackwingjobs.com",
  operator: "Pyae Sone Paing",
  country: "Thailand",
  supportEmail: "stackwingjobs.support@gmail.com",
  businessAddress:
    "B Condo,Soi 39,Bangna Trad-3, บางแก้ว Bang Kaeo, สมุทรปราการ Samut Prakan",
  updatedAt: "20 October 2026",
} as const;

export const policiesAreDraft =
  siteDetails.businessAddress.includes("[ADD YOUR");
