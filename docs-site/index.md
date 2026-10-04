---
layout: home

hero:
  name: Jar
  text: Tips with no middleman
  tagline: Technical documentation for the Solana program and web app. Guests tip by QR into a shift vault that only the program controls. The team runs the jar itself, and anyone can trigger the payout.
  image:
    src: /jar.png
    alt: Jar
  actions:
    - theme: brand
      text: Review in 10 minutes
      link: /guide/judges
    - theme: alt
      text: Read settle()
      link: /program/settle
    - theme: alt
      text: Open the live app
      link: https://jar-tips.vercel.app

features:
  - icon: 🔐
    title: No custodian
    details: Each shift's vault is a token account whose only authority is a program-derived address. No private key exists that can move the tips.
    link: /program/accounts
    linkText: Accounts and PDAs
  - icon: 🚪
    title: One exit door
    details: The program has no withdraw instruction. settle() is the only way tokens leave a vault, and it can only pay the people on that shift.
    link: /program/settle
    linkText: Walk through settle()
  - icon: 🗳️
    title: No owner, no admin key
    details: Adding or removing a coworker takes a majority vote. Hours are self-reported and confirmed by a majority of the shift, at an exact version.
    link: /program/instructions
    linkText: All 10 instructions
  - icon: ⏱️
    title: Nobody can stall the pot
    details: If the shift can't agree before the confirm window ends, anyone can trigger an equal split. A missing person never blocks a payout.
    link: /security/failure-modes
    linkText: Failure modes
  - icon: 🧪
    title: Attacks fail on-chain
    details: The demo stages the restaurant trying to withdraw, redirect a share and join a shift. All three transactions land on devnet and fail.
    link: /security/threat-model
    linkText: Threat model
  - icon: 🔎
    title: Verify, don't trust
    details: The program is deployed with its upgrade authority removed. Check it, rebuild it and replay the end-to-end script yourself.
    link: /security/verify
    linkText: Verify it yourself
---

<div class="vp-doc" style="max-width: 1152px; margin: 48px auto 0; padding: 0 24px;">

## At a glance

| | |
|---|---|
| **Program ID (devnet)** | [`HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD`](https://explorer.solana.com/address/HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD?cluster=devnet) |
| **Upgrade authority** | None. The program is final and nobody can change it, including us |
| **Program source** | One file, 840 lines: [`programs/napiwek/src/lib.rs`](https://github.com/AyhanSh/jar-tips/blob/main/programs/napiwek/src/lib.rs) |
| **Stack** | Anchor 1.x (Rust) · SPL Token / Token-2022 via `token_interface` · React 19 + Vite · Wallet Standard · `@anchor-lang/core` |
| **Live app** | [jar-tips.vercel.app](https://jar-tips.vercel.app), works with no wallet installed |
| **Repository** | [github.com/AyhanSh/jar-tips](https://github.com/AyhanSh/jar-tips) |

</div>
