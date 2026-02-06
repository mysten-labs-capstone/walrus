module sovereignty::registry {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::vec_map::{Self, VecMap};
    use sui::event;

    public struct FileRegistry has key {
        id: UID,
        owner: address,
        files: VecMap<vector<u8>, FileMetadata>
    }

    public struct FileMetadata has store, copy, drop {
        blob_id: vector<u8>,
        encrypted: bool,
        expiration_epoch: u64
    }

    public struct RegistryCreated has copy, drop {
        registry_id: address,
        owner: address
    }

    public entry fun create_registry(user_address: address, ctx: &mut TxContext) {
        let registry = FileRegistry {
            id: object::new(ctx),
            owner: user_address,
            files: vec_map::empty()
        };
        let registry_id = object::uid_to_address(&registry.id);
        
        transfer::share_object(registry);
        
        // Emit event so we can find the registry later
        event::emit(RegistryCreated {
            registry_id,
            owner: user_address
        });
    }

    public entry fun register_file(
        registry: &mut FileRegistry,
        user_address: address,
        file_id: vector<u8>,
        blob_id: vector<u8>,
        encrypted: bool,
        expiration_epoch: u64,
        _ctx: &TxContext
    ) {
        assert!(registry.owner == user_address, 0);
        let metadata = FileMetadata { blob_id, encrypted, expiration_epoch };
        vec_map::insert(&mut registry.files, file_id, metadata);
    }

    public entry fun remove_file(
        registry: &mut FileRegistry,
        user_address: address,
        file_id: vector<u8>,
        _ctx: &TxContext
    ) {
        assert!(registry.owner == user_address, 0);
        vec_map::remove(&mut registry.files, &file_id);
    }
}