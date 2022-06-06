#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] r1 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void send(int64_t value)
   {
      print(" 1 ");

      send_action i11("i11"_n, {get_self(), "active"_n});
      i11.send(value);

      require_recipient("n12"_n);
      require_recipient("n13"_n);

      send_action i14("i14"_n, {get_self(), "active"_n});
      i14.send(value);
   }

   using send_action = action_wrapper<"send"_n, &r1::send>;
};