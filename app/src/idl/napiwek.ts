/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/napiwek.json`.
 */
export type Napiwek = {
  "address": "APy9737Fhn6SsFCyXeMyHC5hNoagbRMnGp89W3LPH91X",
  "metadata": {
    "name": "napiwek",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Restaurant tip pool the owner cannot touch"
  },
  "instructions": [
    {
      "name": "addStaff",
      "docs": [
        "Someone covers part of the shift. The owner can only ever ADD people, and",
        "only while the shift is running; nobody can be removed. Resets confirmations."
      ],
      "discriminator": [
        193,
        22,
        157,
        102,
        182,
        180,
        167,
        123
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "shift"
          ]
        },
        {
          "name": "shift",
          "writable": true
        }
      ],
      "args": [
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
            "Must be on the roster; checked in the instruction."
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
      "name": "createVenue",
      "docs": [
        "One venue per owner wallet. Fixes the tip currency and how long staff get",
        "to agree on hours before the equal-split fallback kicks in."
      ],
      "discriminator": [
        162,
        203,
        21,
        140,
        131,
        95,
        73,
        87
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "venue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
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
        }
      ]
    },
    {
      "name": "endShift",
      "docs": [
        "Owner closes the shift early (kitchen closed). Only ever moves the end",
        "time earlier; a shift also closes by itself at its scheduled end."
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
          "name": "owner",
          "signer": true,
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
        "Owner opens a shift: who is working and for how long. After this the",
        "owner has no say over the money that lands in the vault."
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
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "venue"
          ]
        },
        {
          "name": "venue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "venue"
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
                "path": "venue"
              },
              {
                "kind": "account",
                "path": "venue.shiftCount",
                "account": "venue"
              }
            ]
          }
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
          "name": "staff",
          "type": {
            "vec": {
              "defined": {
                "name": "staffInput"
              }
            }
          }
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "THE MOMENT THE INTERMEDIARY DISAPPEARS.",
        "",
        "Anyone can call this: a waiter, a bot, the owner, a stranger. The caller",
        "cannot choose where the money goes. The payout accounts must be passed in",
        "roster order and each must belong to the staff member at that position;",
        "the vault's only authority is the shift PDA, so this function is the single",
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
                "path": "shift.venue",
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
          "name": "owner",
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
            "Must be on the roster; checked in the instruction."
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
        "vault; the owner's account is not involved at all."
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
      "name": "venue",
      "discriminator": [
        8,
        155,
        85,
        226,
        234,
        173,
        42,
        242
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
      "msg": "A shift needs between 1 and 12 staff"
    },
    {
      "code": 6004,
      "name": "ownerOnRoster",
      "msg": "The owner cannot be on the tip roster"
    },
    {
      "code": 6005,
      "name": "duplicateStaff",
      "msg": "This wallet is already on the roster"
    },
    {
      "code": 6006,
      "name": "notOnRoster",
      "msg": "Signer is not on this shift's roster"
    },
    {
      "code": 6007,
      "name": "unauthorized",
      "msg": "Only the owner can do this"
    },
    {
      "code": 6008,
      "name": "zeroAmount",
      "msg": "Tip amount must be greater than zero"
    },
    {
      "code": 6009,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6010,
      "name": "alreadySettled",
      "msg": "Shift has already been settled"
    },
    {
      "code": 6011,
      "name": "shiftClosed",
      "msg": "Shift is closed"
    },
    {
      "code": 6012,
      "name": "shiftStillOpen",
      "msg": "Shift is still running"
    },
    {
      "code": 6013,
      "name": "tooManyMinutes",
      "msg": "More minutes than the shift lasted"
    },
    {
      "code": 6014,
      "name": "staleVersion",
      "msg": "Hours changed since you looked; review them again"
    },
    {
      "code": 6015,
      "name": "noMajorityYet",
      "msg": "No majority yet and the confirm window is still open"
    },
    {
      "code": 6016,
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
            "name": "venue",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Stored only to pin the rent refund and the owner-only actions. Never paid tips."
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
            "name": "venue",
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
      "name": "staffInput",
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
    },
    {
      "name": "venue",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
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
              "Seconds after the shift closes before the equal-split fallback is allowed."
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
          }
        ]
      }
    }
  ]
};
