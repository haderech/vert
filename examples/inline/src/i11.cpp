#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] i11 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void send(int64_t value)
   {
      print(" 2 ");

      require_recipient("n111"_n);

      send_action i112("i112"_n, {get_self(), "active"_n});
      i112.send(value);
   }

   using send_action = action_wrapper<"send"_n, &i11::send>;
};