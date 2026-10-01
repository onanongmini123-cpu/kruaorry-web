# LINE OA Rich Menu handoff

`config/line-rich-menu.json` is the reviewed, machine-readable Rich Menu
definition for the KruAorry LINE Official Account. It intentionally contains
only public destinations and a fixed message action:

- KruAorry website
- membership application and status page
- the payment-instructions section on the membership page
- a report-problem message action that sends `ต้องการแจ้งปัญหาการใช้งาน…`

This repository does not publish the menu. Before an operator creates or
switches the live Rich Menu, they must:

1. Confirm that `https://kruaorry-web.vercel.app` is still the production
   origin and update all three URI actions together if it changes.
2. Prepare and review a 2500 × 1686 image whose top banner spans the full
   width and whose lower row has three buttons matching the JSON bounds.
3. Check the membership and payment destinations in a signed-out browser and
   on a phone with LINE installed.
4. Create the Rich Menu, upload its image, and set it as the default through an
   approved LINE OA operational workflow outside this repository.

Do not add channel secrets or access tokens to this file, the documentation,
or Git. The menu does not collect a phone number and must not imply that the
website does.
