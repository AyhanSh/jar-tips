/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/napiwek.json`.
 */
export type Napiwek = {
  "address": "HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD",
  "metadata": {
    "name": "napiwek",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Restaurant tips with no owner and no middleman"
  },
  "instructions": [
    {
      "name": "confirm",
      "docs": [
        "A staff member signs off on everyone's hours exactly as they are at",
        "`version`. Passing the version means nobody can be tricked into approving",
        "numbers that changed after they looked."
      ],
      "discriminator": [
        174,
        1,
        15,
        213,
        3,
        190,
        131,
        0
      ],
      "accounts": [
        {
          "name": "staff",
          "docs": [
            "Must be on the shift's roster; checked in the instruction."
          ],
          "signer": true
        },
        {
          "name": "shift",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "version",
          "type": "u32"
        }
      ]
    },
    {
      "name": "createTeam",
      "docs": [
        "A team member starts the team with their coworkers. Fixes the tip currency",
        "and how long people get to agree on hours before the equal split kicks in.",
        "The creator must be on the team and gets no extra rights."
      ],
      "discriminator": [
        122,
        161,
        98,
        67,
        178,
        128,
        116,
        113
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "team",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "confirmWindow",
          "type": "i64"
        },
        {
          "name": "members",
          "type": {
            "vec": {
              "defined": {
                "name": "memberInput"
              }
            }
          }
        }
      ]
    },
    {
      "name": "endShift",
      "docs": [
        "Someone working the shift closes it early (kitchen closed). Only ever moves",
        "the end time earlier; a shift also closes by itself at its scheduled end."
      ],
      "discriminator": [
        234,
        194,
        59,
        125,
        85,
        64,
        171,
        239
      ],
      "accounts": [
        {
          "name": "staff",
          "docs": [
            "Must be on the shift's roster; checked in the instruction."
          ],
          "signer": true
        },
        {
          "name": "shift",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "joinShift",
      "docs": [
        "A team member who is working but wasn't listed adds themselves (someone",
        "covers, or the opener forgot them). Nobody can add anyone else, and nobody",
        "can be removed. Resets confirmations."
      ],
      "discriminator": [
        18,
        157,
        98,
        196,
        22,
        174,
        57,
        140
      ],
      "accounts": [
        {
          "name": "member",
          "docs": [
            "Must be on the team; checked in the instruction."
          ],
          "signer": true
        },
        {
          "name": "team",
          "relations": [
            "shift"
          ]
        },
        {
          "name": "shift",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "openShift",
      "docs": [
        "Any team member opens a shift for the coworkers working it. Only team",
        "members can be on it, so nobody can slip in a fake name."
      ],
      "discriminator": [
        135,
        53,
        16,
        150,
        95,
        0,
        95,
        104
      ],
      "accounts": [
        {
          "name": "opener",
          "docs": [
            "Must be on the team; checked in the instruction. Pays the rent, gets it back at payout."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "team",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "team"
          ]
        },
        {
          "name": "shift",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "team"
              },
              {
                "kind": "account",
                "path": "team.shiftCount",
                "account": "team"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "`init_if_needed`: the address is predictable, so someone could create it",
            "first to block the shift. If it exists it must still be the shift's own",
            "account for this mint, and anything already in it is shared like a tip."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "shift"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "label",
          "type": "string"
        },
        {
          "name": "scheduledMinutes",
          "type": "u16"
        },
        {
          "name": "workers",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "propose",
      "docs": [
        "A team member proposes adding (`add = true`) or removing a coworker. It",
        "takes effect once more than half the team approves; the proposer's vote",
        "counts right away. One proposal at a time: only its proposer can replace",
        "it, or anyone once it is a day old."
      ],
      "discriminator": [
        93,
        253,
        82,
        168,
        118,
        33,
        102,
        90
      ],
      "accounts": [
        {
          "name": "member",
          "docs": [
            "Must be on the team; checked in the instruction."
          ],
          "signer": true
        },
        {
          "name": "team",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "add",
          "type": "bool"
        },
        {
          "name": "wallet",
          "type": "pubkey"
        },
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "THE MOMENT THE INTERMEDIARY DISAPPEARS.",
        "",
        "Anyone can call this: a waiter, a bot, a stranger. The caller cannot",
        "choose where the money goes. The payout accounts must be passed in roster",
        "order and each must belong to the staff member at that position; the",
        "vault's only authority is the shift PDA, so this function is the single",
        "exit door for tips.",
        "",
        "* majority of the roster confirmed the current hours -> split pro-rata by minutes",
        "* no majority, confirm window passed                 -> split equally (nobody stalls the pot)"
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "shift",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  105,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shift.team",
                "account": "shift"
              },
              {
                "kind": "account",
                "path": "shift.index",
                "account": "shift"
              }
            ]
          }
        },
        {
          "name": "openedBy",
          "writable": true,
          "relations": [
            "shift"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "shift"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "shift"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "submitHours",
      "docs": [
        "A staff member states how long they worked. Only they can set their own",
        "hours, capped at the shift length. Any change invalidates earlier confirmations."
      ],
      "discriminator": [
        135,
        190,
        70,
        235,
        234,
        220,
        207,
        48
      ],
      "accounts": [
        {
          "name": "staff",
          "docs": [
            "Must be on the shift's roster; checked in the instruction."
          ],
          "signer": true
        },
        {
          "name": "shift",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "minutes",
          "type": "u16"
        }
      ]
    },
    {
      "name": "tip",
      "docs": [
        "A customer tips. Tokens move straight from their wallet into the shift",
        "vault; no restaurant account is involved at all."
      ],
      "discriminator": [
        77,
        164,
        35,
        21,
        36,
        121,
        213,
        51
      ],
      "accounts": [
        {
          "name": "tipper",
          "writable": true,
          "signer": true
        },
        {
          "name": "shift",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "shift"
          ]
        },
        {
          "name": "tipperToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "shift"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "vote",
      "docs": [
        "A team member approves the open proposal. Passing its id means nobody can",
        "be tricked into approving a different proposal that replaced it."
      ],
      "discriminator": [
        227,
        110,
        155,
        23,
        136,
        126,
        172,
        25
      ],
      "accounts": [
        {
          "name": "member",
          "docs": [
            "Must be on the team; checked in the instruction."
          ],
          "signer": true
        },
        {
          "name": "team",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u32"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "shift",
      "discriminator": [
        16,
        43,
        39,
        90,
        253,
        173,
        56,
        13
      ]
    },
    {
      "name": "team",
      "discriminator": [
        140,
        218,
        177,
        140,
        193,
        241,
        199,
        106
      ]
    }
  ],
  "events": [
    {
      "name": "confirmed",
      "discriminator": [
        241,
        59,
        234,
        249,
        244,
        34,
        38,
        147
      ]
    },
    {
      "name": "hoursSubmitted",
      "discriminator": [
        65,
        193,
        210,
        7,
        93,
        134,
        161,
        22
      ]
    },
    {
      "name": "joined",
      "discriminator": [
        16,
        20,
        44,
        48,
        132,
        189,
        68,
        98
      ]
    },
    {
      "name": "proposed",
      "discriminator": [
        216,
        37,
        138,
        141,
        130,
        208,
        180,
        153
      ]
    },
    {
      "name": "settled",
      "discriminator": [
        232,
        210,
        40,
        17,
        142,
        124,
        145,
        238
      ]
    },
    {
      "name": "shiftOpened",
      "discriminator": [
        16,
        157,
        239,
        182,
        149,
        194,
        99,
        76
      ]
    },
    {
      "name": "teamChanged",
      "discriminator": [
        190,
        254,
        214,
        239,
        202,
        34,
        235,
        98
      ]
    },
    {
      "name": "teamCreated",
      "discriminator": [
        172,
        52,
        201,
        62,
        192,
        159,
        66,
        49
      ]
    },
    {
      "name": "tipped",
      "discriminator": [
        5,
        180,
        227,
        203,
        87,
        116,
        150,
        135
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "nameTooLong",
      "msg": "Name is empty or too long"
    },
    {
      "code": 6001,
      "name": "invalidWindow",
      "msg": "Confirm window out of range"
    },
    {
      "code": 6002,
      "name": "invalidShiftLength",
      "msg": "Shift length must be 1 minute to 24 hours"
    },
    {
      "code": 6003,
      "name": "invalidRoster",
      "msg": "A team or shift needs between 1 and 12 people"
    },
    {
      "code": 6004,
      "name": "creatorNotMember",
      "msg": "Whoever starts the team must be on it"
    },
    {
      "code": 6005,
      "name": "duplicateStaff",
      "msg": "This wallet is already listed"
    },
    {
      "code": 6006,
      "name": "notMember",
      "msg": "Signer is not on this team"
    },
    {
      "code": 6007,
      "name": "notOnRoster",
      "msg": "Signer is not on this shift's roster"
    },
    {
      "code": 6008,
      "name": "proposalPending",
      "msg": "Another proposal is still open"
    },
    {
      "code": 6009,
      "name": "noProposal",
      "msg": "There is no open proposal"
    },
    {
      "code": 6010,
      "name": "wrongProposal",
      "msg": "The proposal changed since you looked; review it again"
    },
    {
      "code": 6011,
      "name": "proposalExpired",
      "msg": "The proposal expired"
    },
    {
      "code": 6012,
      "name": "lastMember",
      "msg": "A team can't remove its last member"
    },
    {
      "code": 6013,
      "name": "zeroAmount",
      "msg": "Tip amount must be greater than zero"
    },
    {
      "code": 6014,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6015,
      "name": "alreadySettled",
      "msg": "Shift has already been settled"
    },
    {
      "code": 6016,
      "name": "shiftStillOpen",
      "msg": "Shift is still running"
    },
    {
      "code": 6017,
      "name": "tooManyMinutes",
      "msg": "More minutes than the shift lasted"
    },
    {
      "code": 6018,
      "name": "staleVersion",
      "msg": "Hours changed since you looked; review them again"
    },
    {
      "code": 6019,
      "name": "noMajorityYet",
      "msg": "No majority yet and the confirm window is still open"
    },
    {
      "code": 6020,
      "name": "wrongPayoutAccount",
      "msg": "Payout account does not belong to the staff member at that position"
    }
  ],
  "types": [
    {
      "name": "confirmed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shift",
            "type": "pubkey"
          },
          {
            "name": "staff",
            "type": "pubkey"
          },
          {
            "name": "confirmations",
            "type": "u8"
          },
          {
            "name": "roster",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "hoursSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shift",
            "type": "pubkey"
          },
          {
            "name": "staff",
            "type": "pubkey"
          },
          {
            "name": "minutes",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "joined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shift",
            "type": "pubkey"
          },
          {
            "name": "staff",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "memberInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "proposal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "add",
            "docs": [
              "true: add `wallet` as `name`. false: remove `wallet`."
            ],
            "type": "bool"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "votes",
            "docs": [
              "Bit i set = members[i] approved."
            ],
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "proposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "add",
            "type": "bool"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "settled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shift",
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": "u64"
          },
          {
            "name": "byTimeout",
            "type": "bool"
          },
          {
            "name": "triggeredBy",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": {
              "vec": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "shift",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "openedBy",
            "docs": [
              "Paid the rent; gets the vault's rent back at payout. Never paid tips for it."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "label",
            "type": "string"
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "closesAt",
            "type": "i64"
          },
          {
            "name": "scheduledMinutes",
            "type": "u16"
          },
          {
            "name": "confirmWindow",
            "type": "i64"
          },
          {
            "name": "version",
            "docs": [
              "Bumped on every roster or hours change; confirmations are for one version."
            ],
            "type": "u32"
          },
          {
            "name": "totalTipped",
            "type": "u64"
          },
          {
            "name": "tipCount",
            "type": "u32"
          },
          {
            "name": "settled",
            "type": "bool"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "byTimeout",
            "type": "bool"
          },
          {
            "name": "paidOut",
            "type": "u64"
          },
          {
            "name": "staff",
            "type": {
              "vec": {
                "defined": {
                  "name": "staffEntry"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "shiftOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shift",
            "type": "pubkey"
          },
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "staff",
            "type": "u8"
          },
          {
            "name": "closesAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "staffEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "minutes",
            "type": "u16"
          },
          {
            "name": "submitted",
            "type": "bool"
          },
          {
            "name": "confirmedVersion",
            "type": "u32"
          },
          {
            "name": "paid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "team",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "docs": [
              "Paid the rent and seeds the address. No special rights."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "confirmWindow",
            "docs": [
              "Seconds after a shift closes before the equal-split fallback is allowed."
            ],
            "type": "i64"
          },
          {
            "name": "shiftCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "members",
            "type": {
              "vec": {
                "defined": {
                  "name": "member"
                }
              }
            }
          },
          {
            "name": "proposalCount",
            "type": "u32"
          },
          {
            "name": "proposal",
            "type": {
              "option": {
                "defined": {
                  "name": "proposal"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "teamChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "add",
            "type": "bool"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "teamCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "members",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tipped",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shift",
            "type": "pubkey"
          },
          {
            "name": "tipper",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
