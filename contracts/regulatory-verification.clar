;; Component Registry Contract
;; Clarity v2
;; Registers and tracks aircraft components with lifecycle events, ownership, and provenance for aerospace MRO

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-ALREADY-REGISTERED u101)
(define-constant ERR-NOT-REGISTERED u102)
(define-constant ERR-PAUSED u103)
(define-constant ERR-ZERO-ADDRESS u104)
(define-constant ERR-INVALID-METADATA u105)
(define-constant ERR-NOT-OWNER u106)
(define-constant ERR-INVALID-COMPONENT u107)

;; Admin and contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var component-counter uint u0)

;; Component data structure
(define-map components
  { component-id: uint }
  {
    serial-number: (string-ascii 64),
    part-number: (string-ascii 64),
    manufacturer: principal,
    owner: principal,
    metadata: (string-ascii 256), ;; e.g., JSON string with specs, certifications
    status: (string-ascii 32),   ;; e.g., "active", "retired", "under-repair"
    created-at: uint,
    last-updated: uint
  }
)

;; Provenance log for lifecycle events
(define-map provenance
  { component-id: uint, event-id: uint }
  {
    event-type: (string-ascii 32), ;; e.g., "registered", "transferred", "updated"
    initiator: principal,
    timestamp: uint,
    details: (string-ascii 256)    ;; e.g., JSON string with event details
  }
)

;; Track event counter per component
(define-map event-counters { component-id: uint } uint)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: validate metadata
(define-private (validate-metadata (metadata (string-ascii 256)))
  (let ((length (len metadata)))
    (asserts! (and (> length u0) (<= length u256)) (err ERR-INVALID-METADATA))
    (ok true)
  )
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Register a new component
(define-public (register-component
  (serial-number (string-ascii 64))
  (part-number (string-ascii 64))
  (manufacturer principal)
  (metadata (string-ascii 256))
)
  (begin
    (ensure-not-paused)
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (try! (validate-metadata metadata))
    (let ((component-id (+ (var-get component-counter) u1)))
      (asserts! (is-none (map-get? components { component-id: component-id })) (err ERR-ALREADY-REGISTERED))
      (map-set components
        { component-id: component-id }
        {
          serial-number: serial-number,
          part-number: part-number,
          manufacturer: manufacturer,
          owner: tx-sender,
          metadata: metadata,
          status: "active",
          created-at: block-height,
          last-updated: block-height
        }
      )
      (map-set event-counters { component-id: component-id } u1)
      (map-set provenance
        { component-id: component-id, event-id: u1 }
        {
          event-type: "registered",
          initiator: tx-sender,
          timestamp: block-height,
          details: (concat "{\"serial\":\"" serial-number "\",\"part\":\"" part-number "\"}")
        }
      )
      (var-set component-counter component-id)
      (ok component-id)
    )
  )
)

;; Transfer component ownership
(define-public (transfer-ownership (component-id uint) (new-owner principal))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq new-owner 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (match (map-get? components { component-id: component-id })
      component
      (begin
        (asserts! (is-eq tx-sender (get owner component)) (err ERR-NOT-OWNER))
        (map-set components
          { component-id: component-id }
          (merge component { owner: new-owner, last-updated: block-height })
        )
        (let ((event-id (+ (default-to u0 (map-get? event-counters { component-id: component-id })) u1)))
          (map-set event-counters { component-id: component-id } event-id)
          (map-set provenance
            { component-id: component-id, event-id: event-id }
            {
              event-type: "transferred",
              initiator: tx-sender,
              timestamp: block-height,
              details: (concat "{\"new-owner\":\"" (principal-to-string new-owner) "\"}")
            }
          )
        )
        (ok true)
      )
      (err ERR-NOT-REGISTERED)
    )
  )
)

;; Update component metadata (e.g., new certifications)
(define-public (update-metadata (component-id uint) (metadata (string-ascii 256)))
  (begin
    (ensure-not-paused)
    (try! (validate-metadata metadata))
    (match (map-get? components { component-id: component-id })
      component
      (begin
        (asserts! (or (is-admin) (is-eq tx-sender (get owner component))) (err ERR-NOT-AUTHORIZED))
        (map-set components
          { component-id: component-id }
          (merge component { metadata: metadata, last-updated: block-height })
        )
        (let ((event-id (+ (default-to u0 (map-get? event-counters { component-id: component-id })) u1)))
          (map-set event-counters { component-id: component-id } event-id)
          (map-set provenance
            { component-id: component-id, event-id: event-id }
            {
              event-type: "metadata-updated",
              initiator: tx-sender,
              timestamp: block-height,
              details: metadata
            }
          )
        )
        (ok true)
      )
      (err ERR-NOT-REGISTERED)
    )
  )
)

;; Update component status (e.g., "retired", "under-repair")
(define-public (update-status (component-id uint) (status (string-ascii 32)))
  (begin
    (ensure-not-paused)
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (match (map-get? components { component-id: component-id })
      component
      (begin
        (map-set components
          { component-id: component-id }
          (merge component { status: status, last-updated: block-height })
        )
        (let ((event-id (+ (default-to u0 (map-get? event-counters { component-id: component-id })) u1)))
          (map-set event-counters { component-id: component-id } event-id)
          (map-set provenance
            { component-id: component-id, event-id: event-id }
            {
              event-type: "status-updated",
              initiator: tx-sender,
              timestamp: block-height,
              details: (concat "{\"status\":\"" status "\"}")
            }
          )
        )
        (ok true)
      )
      (err ERR-NOT-REGISTERED)
    )
  )
)

;; Read-only: get component details
(define-read-only (get-component (component-id uint))
  (match (map-get? components { component-id: component-id })
    component (ok component)
    (err ERR-NOT-REGISTERED)
  )
)

;; Read-only: get provenance event
(define-read-only (get-provenance (component-id uint) (event-id uint))
  (match (map-get? provenance { component-id: component-id, event-id: event-id })
    event (ok event)
    (err ERR-NOT-REGISTERED)
  )
)

;; Read-only: get event counter
(define-read-only (get-event-counter (component-id uint))
  (ok (default-to u0 (map-get? event-counters { component-id: component-id })))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: get total components
(define-read-only (get-total-components)
  (ok (var-get component-counter))
)